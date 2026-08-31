const {
	app,
	BrowserWindow,
	Menu,
	ipcMain,
	dialog,
	protocol,
	net,
	screen,
} = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");
const { registerSaveStoreIpc } = require("./fs-save-store.cjs");
const { classifyBspriteBytes } = require("./bsprite-classify.cjs");
const { GAME_READY_MESSAGE } = require("./game-ready.cjs");

// Brand the userData directory (saves, window manifest, Chromium cache) under a
// stable "Bitsplash" folder instead of Electron's default. Distinct from the
// playtest game's userData, so the editor and the playtest process it spawns
// never contend for one Chromium cache dir. Must run before userData is read.
app.setName("Bitsplash");

// Enable DRR boost (Win11 24H2+)
app.commandLine.appendSwitch(
	"enable-features",
	"UseCompositorClockVSyncInterval",
);

// One editor instance owns the shared heap; a second launch focuses the first
// hub window instead of spawning a rival process.
if (!app.requestSingleInstanceLock()) {
	app.quit();
}

// The hub window's workspace id. Intentionally a separate constant from the
// editor's `HUB_WINDOW_ID` (src/editor/workspace/layout.ts): the two live in
// different architectural layers (desktop main vs. editor renderer) and sharing
// one module would cross the layer boundary the project forbids. They are a
// hand-kept cross-layer contract — keep both in sync if either changes.
const HUB_WINDOW_ID = "hub";

let hubWindow = null;

// Window-close choreography (WS-C6 dirty guard). Main intercepts every native
// window close (title-bar X, app quit) and defers to the hub realm's DOM guard,
// which owns dirty state in the shared heap. `quitting` short-circuits the guard
// once a quit is committed; `allowClose` lists windows the hub has cleared to
// close on their next close event; `windowIdByWc` maps a webContents to its
// workspace window id (`"hub"` for the hub, the `window.open` frame name for
// satellites).
let quitting = false;
const allowClose = new Set();
const windowIdByWc = new Map();

// Most-recently-focused window ids, front = topmost. The cross-window tab-drag
// hit-test (WS-E) resolves overlapping windows by this z-order proxy: the
// topmost window whose strip is under the cursor wins. Updated on every window
// focus; entries are pruned when a window closes.
const focusOrder = [];

const bumpFocus = (windowId) => {
	const at = focusOrder.indexOf(windowId);
	if (at >= 0) {
		focusOrder.splice(at, 1);
	}
	focusOrder.unshift(windowId);
};

const isSatelliteWc = (webContentsId) =>
	windowIdByWc.get(webContentsId) !== undefined &&
	windowIdByWc.get(webContentsId) !== HUB_WINDOW_ID;

/**
 * Intercept `window`'s native close so the hub can run the dirty guard first.
 * A close committed by the hub (`allowClose`) or during an app quit passes
 * straight through; any other close is cancelled and the hub is asked to guard
 * the window, replying via the `window:allow-close` IPC.
 */
const installCloseGuard = (window, windowId) => {
	// `closed` fires after the window and its webContents are destroyed, so the
	// webContents id is captured now, while it is still readable, and used for the
	// teardown lookup — reading `window.webContents` from a `closed` handler throws
	// "Object has been destroyed".
	const webContentsId = window.webContents.id;
	windowIdByWc.set(webContentsId, windowId);
	bumpFocus(windowId);
	window.on("focus", () => bumpFocus(windowId));
	window.on("closed", () => {
		windowIdByWc.delete(webContentsId);
		allowClose.delete(windowId);
		const at = focusOrder.indexOf(windowId);
		if (at >= 0) {
			focusOrder.splice(at, 1);
		}
	});
	window.on("close", (event) => {
		if (quitting || allowClose.has(windowId)) {
			allowClose.delete(windowId);
			return;
		}
		event.preventDefault();
		if (hubWindow && !hubWindow.isDestroyed()) {
			hubWindow.webContents.send("window:close-requested", windowId);
		}
	});
	// The renderer's beforeunload cancels a reload while documents are dirty. Once
	// a quit is committed (or this window is cleared to close), force the unload
	// through — otherwise the stale in-flight dirty flag would abort the quit;
	// leave a genuine dirty reload blocked (calling preventDefault here *allows*
	// the unload, per Electron's will-prevent-unload contract).
	window.webContents.on("will-prevent-unload", (event) => {
		if (quitting || allowClose.has(windowId)) {
			event.preventDefault();
		}
	});
};

app.on("second-instance", () => {
	if (hubWindow && !hubWindow.isDestroyed()) {
		if (hubWindow.isMinimized()) {
			hubWindow.restore();
		}
		hubWindow.focus();
	}
});

// `VITE_DEV_PORT` lets a harness run a dev server on its own port so several
// measurement runs can proceed at once; `bun dev` leaves it unset.
const DEV_URL = `https://localhost:${process.env.VITE_DEV_PORT ?? 5173}`;

const CONNECTION_ERRORS = new Set([
	-102, -105, -106, -109, -118, -324,
]);

/**
 * Attach a permanent dev-server retry loader to `window`. Whenever the main
 * frame fails with a transient connection error — dev server restarting, an HMR
 * full-reload racing the server — reload the URL that failed after a short
 * delay. Unlike a one-shot loader this never unhooks, so repeated Vite restarts
 * keep recovering; it is installed on every window (hub and popouts) via
 * `browser-window-created`.
 */
const installRetryLoader = (window) => {
	window.webContents.on(
		"did-fail-load",
		(_event, errorCode, _description, validatedURL, isMainFrame) => {
			if (!isMainFrame || !CONNECTION_ERRORS.has(errorCode)) {
				return;
			}
			setTimeout(() => {
				if (!window.isDestroyed() && validatedURL) {
					void window.webContents.loadURL(validatedURL);
				}
			}, 200);
		},
	);
};

const loadDevURL = (window, url) => {
	void window.loadURL(url);
};

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.1;

const clampZoom = (value) =>
	Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)) * 100) /
	100;

/**
 * Main-owned window state, read from disk before any renderer exists so the hub
 * opens at its remembered geometry and zoom. Shape:
 * `{ zoom, windows: { [windowId]: { bounds, maximized } } }`. The hub uses the
 * fixed id `"hub"`; satellite ids are assigned by the hub realm (WS-C/B4).
 */
const manifestState = { zoom: 1, windows: {} };
let manifestPath = null;
let manifestWriteTimer = null;

const loadManifest = () => {
	try {
		const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
		if (typeof parsed.zoom === "number" && parsed.zoom > 0) {
			manifestState.zoom = clampZoom(parsed.zoom);
		}
		if (parsed.windows && typeof parsed.windows === "object") {
			manifestState.windows = parsed.windows;
		}
	} catch {}
};

const flushManifest = () => {
	if (manifestWriteTimer) {
		clearTimeout(manifestWriteTimer);
		manifestWriteTimer = null;
	}
	if (!manifestPath) {
		return;
	}
	try {
		fs.writeFileSync(
			manifestPath,
			JSON.stringify(manifestState, null, 2),
		);
	} catch {}
};

const scheduleManifestWrite = () => {
	if (manifestWriteTimer) {
		clearTimeout(manifestWriteTimer);
	}
	manifestWriteTimer = setTimeout(flushManifest, 250);
};

/**
 * Persist a window's normalized bounds and maximized flag under `windowId` on
 * every OS move/resize/maximize (no DOM event fires for a window move, so this
 * must live in main). Only non-maximized bounds are recorded, so unmaximizing
 * restores the prior size.
 */
const trackWindowBounds = (window, windowId) => {
	const record = () => {
		if (window.isDestroyed()) {
			return;
		}
		const maximized = window.isMaximized();
		const entry = manifestState.windows[windowId] ?? {};
		entry.maximized = maximized;
		if (!maximized) {
			entry.bounds = window.getBounds();
		}
		manifestState.windows[windowId] = entry;
		scheduleManifestWrite();
	};
	for (const eventName of [
		"move",
		"resize",
		"maximize",
		"unmaximize",
	]) {
		window.on(eventName, record);
	}
};

/** Broadcast the current zoom (as a whole-number percentage) to every window. */
const broadcastZoom = (percent) => {
	for (const window of BrowserWindow.getAllWindows()) {
		if (!window.isDestroyed()) {
			window.webContents.send("zoom-changed", percent);
		}
	}
};

/**
 * Set the persisted editor zoom and apply it. Chromium keys zoom by host, so
 * applying it to one same-origin webContents propagates live to every editor
 * window (hub and popouts); persisting it lets new windows open pre-zoomed and
 * never flash at 100%.
 */
const applyZoom = (window, nextZoom) => {
	const zoom = clampZoom(nextZoom);
	manifestState.zoom = zoom;
	window.webContents.setZoomFactor(zoom);
	broadcastZoom(Math.round(zoom * 100));
	scheduleManifestWrite();
};

/**
 * Handle Ctrl+`=`/`+`/`−`/`0` in the main process via `before-input-event`. The
 * app menu is null and this must work in a popout before any React root exists,
 * so zoom cannot be a renderer hotkey.
 */
const installZoomShortcuts = (window) => {
	window.webContents.on("before-input-event", (event, input) => {
		if (input.type !== "keyDown") {
			return;
		}
		// Satellites carry no app JS or Vite client, so a self-reload would strip
		// them to a blank popout with no beforeunload guard. Block Ctrl+R / F5 in
		// satellites outright (plan lines 103-105); the hub's reload is guarded in
		// the renderer via beforeunload.
		if (isSatelliteWc(window.webContents.id)) {
			const key = input.key.toLowerCase();
			if (key === "f5" || (input.control && key === "r")) {
				event.preventDefault();
				return;
			}
		}
		if (!input.control) {
			return;
		}
		if (input.key === "=" || input.key === "+") {
			applyZoom(window, manifestState.zoom + ZOOM_STEP);
			event.preventDefault();
		} else if (input.key === "-") {
			applyZoom(window, manifestState.zoom - ZOOM_STEP);
			event.preventDefault();
		} else if (input.key === "0") {
			applyZoom(window, 1);
			event.preventDefault();
		}
	});
};

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const LEVELS_DIR = path.join(
	PROJECT_ROOT,
	"src",
	"game",
	"content",
	"levels",
);
const ASSETS_DIR = path.join(
	PROJECT_ROOT,
	"src",
	"game",
	"content",
	"assets",
);
const TRASH_DIR = path.join(PROJECT_ROOT, ".trash");
const FS_SCHEME = "bitsplash-fs";

protocol.registerSchemesAsPrivileged([
	{
		scheme: FS_SCHEME,
		privileges: {
			standard: true,
			secure: true,
			supportFetchAPI: true,
			stream: true,
		},
	},
]);

const moveItem = async (src, dest) => {
	try {
		await fsp.rename(src, dest);
	} catch (error) {
		if (error && error.code === "EXDEV") {
			await fsp.cp(src, dest, { recursive: true });
			await fsp.rm(src, { recursive: true, force: true });
		} else {
			throw error;
		}
	}
};

const AUDIO_EXTENSIONS = [".wav", ".mp3", ".ogg"];
const FONT_EXTENSIONS = [".ttf", ".otf", ".woff", ".woff2"];
const FONT_ZIP_SUFFIX = ".font.zip";
const TILESET_SUFFIX = ".tileset.png";
const BSPRITE_SUFFIX = ".bsprite";

const isBspriteName = (name) =>
	name.toLowerCase().endsWith(BSPRITE_SUFFIX);

// TODO: Move out of main.cjs
const bspriteCache = new Map();
const classifyBspriteFile = async (absPath) => {
	try {
		const stat = await fsp.stat(absPath);
		const cached = bspriteCache.get(absPath);
		if (cached && cached.mtimeMs === stat.mtimeMs) {
			return cached.result;
		}
		const bytes = await fsp.readFile(absPath);
		const result = classifyBspriteBytes(bytes);
		bspriteCache.set(absPath, { mtimeMs: stat.mtimeMs, result });
		return result;
	} catch {
		return { kind: "unknown" };
	}
};

const assetEntry = async (name, relPath, full) => {
	const lower = name.toLowerCase();
	const entry = {
		name,
		url: `/src/game/content/assets/${relPath.split(path.sep).join("/")}`,
		ext: name.split(".").slice(1).join("."),
		isPng: lower.endsWith(".png"),
		isAudio: AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext)),
		isFont:
			lower.endsWith(FONT_ZIP_SUFFIX) ||
			FONT_EXTENSIONS.some((ext) => lower.endsWith(ext)),
		isTileset: lower.endsWith(TILESET_SUFFIX),
	};
	if (isBspriteName(name)) {
		const classification = await classifyBspriteFile(full);
		entry.kind = classification.kind;
		entry.isTileset = classification.kind === "tileset";
	}
	return entry;
};

const walkAssets = async (dir, base, out) => {
	const dirents = await fsp.readdir(dir, { withFileTypes: true });
	for (const dirent of dirents) {
		const full = path.join(dir, dirent.name);
		const rel = path.join(base, dirent.name);
		if (dirent.isDirectory()) {
			await walkAssets(full, rel, out);
		} else {
			out.push(await assetEntry(dirent.name, rel, full));
		}
	}
};

ipcMain.handle("saveLevel", async (_event, { sceneId, json }) => {
	const id = /^[\w-]+$/.test(sceneId) ? sceneId : "demo";
	await fsp.writeFile(
		path.join(LEVELS_DIR, `${id}.scene.json`),
		json,
	);
	return { saved: true };
});

const RENAME_RETRY_LIMIT = 10;
const RENAME_RETRY_DELAY_MS = 50;

const sleep = (ms) =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rename `from` over `to`, retrying on the transient `EPERM`/`EBUSY` failures
 * Windows raises when antivirus or the search indexer briefly locks a file.
 * Gives up after a bounded number of attempts so a genuinely stuck file
 * surfaces as an error rather than hanging forever.
 */
const renameWithRetry = async (from, to) => {
	for (let attempt = 0; ; attempt += 1) {
		try {
			await fsp.rename(from, to);
			return;
		} catch (error) {
			const transient =
				error && (error.code === "EPERM" || error.code === "EBUSY");
			if (!transient || attempt >= RENAME_RETRY_LIMIT) {
				throw error;
			}
			await sleep(RENAME_RETRY_DELAY_MS);
		}
	}
};

const writeQueues = new Map();

/**
 * Serialize `task` after any pending write to the same `key`, so two concurrent
 * writes to one destination can't interleave their temp/rename steps. Returns
 * the caller's result promise (which may reject); the internally chained tail
 * always settles so a failed write never wedges the queue.
 */
const enqueueWrite = (key, task) => {
	const previous = writeQueues.get(key) ?? Promise.resolve();
	const run = previous.then(task, task);
	const tail = run.then(
		() => {},
		() => {},
	);
	writeQueues.set(key, tail);
	void tail.then(() => {
		if (writeQueues.get(key) === tail) {
			writeQueues.delete(key);
		}
	});
	return run;
};

ipcMain.handle(
	"writeAssetAtomic",
	async (_event, { filename, data, overwrite }) => {
		const safe = path.basename(filename);
		const dest = path.join(ASSETS_DIR, safe);
		const url = `/src/game/content/assets/${safe}`;
		return enqueueWrite(dest, async () => {
			if (fs.existsSync(dest) && !overwrite) {
				return { url, existed: true };
			}
			const temp = path.join(
				ASSETS_DIR,
				`.${safe}.${randomUUID()}.tmp`,
			);
			const handle = await fsp.open(temp, "w");
			try {
				await handle.writeFile(Buffer.from(data));
				await handle.sync();
			} finally {
				await handle.close();
			}
			try {
				await renameWithRetry(temp, dest);
			} catch (error) {
				await fsp.rm(temp, { force: true });
				throw error;
			}
			return { url, existed: false };
		});
	},
);

ipcMain.handle("capturePage", async (event) => {
	const image = await event.sender.capturePage();
	return image.toDataURL();
});

ipcMain.handle("getAssetsRoot", async () => ({ path: ASSETS_DIR }));

ipcMain.handle("readTextFile", async (_event, { path: target }) => {
	const text = await fsp.readFile(target, "utf8");
	return { text };
});

ipcMain.handle("readBinaryFile", async (_event, { path: target }) => {
	const buffer = await fsp.readFile(target);
	const data = buffer.buffer.slice(
		buffer.byteOffset,
		buffer.byteOffset + buffer.byteLength,
	);
	return { data };
});

ipcMain.handle("listDir", async (_event, { path: dir }) => {
	const dirents = await fsp.readdir(dir, { withFileTypes: true });
	const entries = await Promise.all(
		dirents.map(async (dirent) => {
			const full = path.join(dir, dirent.name);
			const entry = {
				name: dirent.name,
				path: full,
				isDirectory: dirent.isDirectory(),
			};
			if (!dirent.isDirectory() && isBspriteName(dirent.name)) {
				entry.kind = (await classifyBspriteFile(full)).kind;
			}
			return entry;
		}),
	);
	return { entries, parent: path.dirname(dir) };
});

ipcMain.handle("listAssetsDeep", async () => {
	const out = [];
	await walkAssets(ASSETS_DIR, "", out);
	out
		.toSorted((a, b) => a.name.localeCompare(b.name))
		.sort((a, b) => a.ext.localeCompare(b.ext));
	return { entries: out };
});

ipcMain.handle(
	"rename",
	async (_event, { path: target, newName }) => {
		const dest = path.join(path.dirname(target), newName);
		if (fs.existsSync(dest)) {
			return { renamed: false, reason: "exists" };
		}
		await fsp.rename(target, dest);
		return { renamed: true, path: dest };
	},
);

ipcMain.handle("mkdir", async (_event, { parent, name }) => {
	const dest = path.join(parent, name);
	await fsp.mkdir(dest, { recursive: false });
	return { path: dest };
});

ipcMain.handle("del", async (_event, { path: target }) => {
	const token = randomUUID();
	const itemDir = path.join(TRASH_DIR, token);
	await fsp.mkdir(itemDir, { recursive: true });
	const name = path.basename(target);
	await moveItem(target, path.join(itemDir, name));
	await fsp.writeFile(
		path.join(itemDir, ".manifest.json"),
		JSON.stringify({ originalPath: target, name }),
	);
	return { token };
});

ipcMain.handle("restore", async (_event, { token }) => {
	const itemDir = path.join(TRASH_DIR, token);
	const manifest = JSON.parse(
		await fsp.readFile(path.join(itemDir, ".manifest.json"), "utf8"),
	);
	await moveItem(
		path.join(itemDir, manifest.name),
		manifest.originalPath,
	);
	await fsp.rm(itemDir, { recursive: true, force: true });
	return { restored: true };
});

ipcMain.handle("openImageDialog", async () => {
	const result = await dialog.showOpenDialog({
		properties: ["openFile"],
		defaultPath: ASSETS_DIR,
		filters: [
			{
				name: "Images",
				extensions: ["png", "jpg", "jpeg", "webp", "bsprite"],
			},
		],
	});
	if (result.canceled || result.filePaths.length === 0) {
		return { path: null };
	}
	return { path: result.filePaths[0] };
});

ipcMain.handle("openFileDialog", async (_event, { accept }) => {
	const extensions = String(accept ?? "")
		.split(",")
		.map((part) => part.trim().replace(/^\./, ""))
		.map((part) => part.split(".").pop())
		.filter(Boolean);
	const result = await dialog.showOpenDialog({
		properties: ["openFile"],
		defaultPath: ASSETS_DIR,
		filters: extensions.length ? [{ name: "Files", extensions }] : [],
	});
	if (result.canceled || result.filePaths.length === 0) {
		return { path: null };
	}
	return { path: result.filePaths[0] };
});

const createWindow = async () => {
	Menu.setApplicationMenu(null);
	protocol.handle(FS_SCHEME, async (request) => {
		const url = new URL(request.url);
		const filePath = decodeURIComponent(
			url.pathname.replace(/^\//, ""),
		);
		const response = await net.fetch(
			pathToFileURL(filePath).toString(),
		);
		// The editor page is cross-origin isolated (see vite.config.ts), so this
		// cross-scheme asset carries CORP to stay embeddable under COEP.
		const headers = new Headers(response.headers);
		headers.set("Cross-Origin-Resource-Policy", "cross-origin");
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	});
	const hubEntry = manifestState.windows.hub;
	const window = new BrowserWindow({
		width: 1280,
		height: 720,
		...hubEntry?.bounds,
		backgroundColor: "#030303",
		titleBarStyle: "hidden",
		titleBarOverlay: {
			color: "#030303",
			symbolColor: "#dedede",
			height: 40,
		},
		webPreferences: {
			preload: path.join(__dirname, "preload.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			zoomFactor: manifestState.zoom,
		},
	});
	hubWindow = window;
	if (hubEntry?.maximized) {
		window.maximize();
	}
	trackWindowBounds(window, HUB_WINDOW_ID);
	installCloseGuard(window, HUB_WINDOW_ID);

	// Shape same-origin popout children opened via window.open. A navigated
	// same-origin child stays in the parent's process/heap only while it keeps
	// COOP same-origin (served by vite's popout middleware); these options give
	// it the frameless chrome (with native min/max/close controls, matching the
	// hub) and disable background throttling so it keeps stepping while the hub is
	// minimized. The persisted zoom is applied at creation so popouts never flash
	// at 100%.
	window.webContents.setWindowOpenHandler(() => ({
		action: "allow",
		overrideBrowserWindowOptions: {
			width: 680,
			height: 520,
			backgroundColor: "#030303",
			titleBarStyle: "hidden",
			titleBarOverlay: {
				color: "#030303",
				symbolColor: "#dedede",
				height: 40,
			},
			webPreferences: {
				preload: path.join(__dirname, "preload.cjs"),
				contextIsolation: true,
				nodeIntegration: false,
				backgroundThrottling: false,
				zoomFactor: manifestState.zoom,
			},
		},
	}));

	// A satellite's workspace window id is the frame name the hub passed to
	// window.open; bind main's close guard to it as soon as the child exists.
	window.webContents.on("did-create-window", (child, details) => {
		installCloseGuard(child, details.frameName);
	});

	loadDevURL(window, DEV_URL);
};

// Every window (hub and popouts) gets the permanent dev retry loader and the
// main-side zoom shortcuts, so both work in a popout before its React root
// exists.
app.on("browser-window-created", (_event, window) => {
	installRetryLoader(window);
	installZoomShortcuts(window);
});

// Playtest launch state (WS-F). Main owns the separate game process's lifecycle
// as a single-run-at-a-time state machine and broadcasts every phase change to
// all windows, so each window's global playtest icon reflects the same state
// (replacing the old per-renderer `launchingGame` flag and its silent dedupe).
let playtestPhase = "idle";

const broadcastPlaytestPhase = () => {
	for (const window of BrowserWindow.getAllWindows()) {
		if (!window.isDestroyed()) {
			window.webContents.send("playtest:state", playtestPhase);
		}
	}
};

const setPlaytestPhase = (phase) => {
	if (playtestPhase === phase) {
		return;
	}
	playtestPhase = phase;
	broadcastPlaytestPhase();
};

/**
 * Spawn the game process, driving {@link playtestPhase} through
 * `launching → running → idle` and broadcasting each transition. Resolves once
 * the child reports ready (so the triggering renderer knows the launch
 * succeeded), rejects if it dies before ready (so that renderer can toast).
 */
const launchGame = () =>
	new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[path.join(__dirname, "game.cjs")],
			{
				stdio: ["ignore", "inherit", "inherit", "ipc"],
				env: {
					...process.env,
					BITSPLASH_DEV_URL: DEV_URL,
				},
			},
		);
		let ready = false;
		child.on("message", (message) => {
			if (message === GAME_READY_MESSAGE) {
				ready = true;
				setPlaytestPhase("running");
				resolve({ opened: true });
			}
		});
		child.on("error", (error) => {
			setPlaytestPhase("idle");
			reject(error);
		});
		child.on("exit", (code) => {
			setPlaytestPhase("idle");
			if (!ready) {
				reject(
					new Error(`game exited before ready (exit code ${code})`),
				);
			}
		});
	});

ipcMain.handle("windowManifest:read", () => ({
	zoom: manifestState.zoom,
	windows: manifestState.windows,
}));

// A cross-window tab-drag snapshot (WS-E), captured in one IPC round-trip so the
// gesture hit-tests in a single consistent frame. `cursor` is the ground-truth
// pointer in screen DIPs (zoom-independent; never `MouseEvent.screenX`); each
// window's content bounds are DIP rects; `zoom` converts a window's
// `getBoundingClientRect()` (zoomed CSS px) into DIPs; `focusOrder` resolves
// overlapping windows (front = topmost).
ipcMain.handle("desktop:dragSnapshot", () => {
	const cursor = screen.getCursorScreenPoint();
	const windows = [];
	for (const window of BrowserWindow.getAllWindows()) {
		if (window.isDestroyed()) {
			continue;
		}
		const windowId = windowIdByWc.get(window.webContents.id);
		if (windowId === undefined) {
			continue;
		}
		windows.push({ id: windowId, bounds: window.getContentBounds() });
	}
	return { cursor, zoom: manifestState.zoom, windows, focusOrder };
});

// Position/size a window by its workspace id (WS-E drop-into-space). If the
// window is already open (last-tab-of-window reuse) its bounds are set live;
// otherwise the bounds are seeded into the manifest so the satellite adopts them
// when it opens and calls `associateWindow` (spawn-at-cursor).
ipcMain.handle(
	"desktop:positionWindow",
	(_event, { windowId, bounds }) => {
		if (!bounds || typeof windowId !== "string") {
			return { positioned: false };
		}
		for (const window of BrowserWindow.getAllWindows()) {
			if (
				!window.isDestroyed() &&
				windowIdByWc.get(window.webContents.id) === windowId
			) {
				window.setContentBounds({
					x: Math.round(bounds.x),
					y: Math.round(bounds.y),
					width: Math.round(bounds.width),
					height: Math.round(bounds.height),
				});
				return { positioned: true };
			}
		}
		const entry = manifestState.windows[windowId] ?? {};
		entry.bounds = {
			x: Math.round(bounds.x),
			y: Math.round(bounds.y),
			width: Math.round(bounds.width),
			height: Math.round(bounds.height),
		};
		entry.maximized = false;
		manifestState.windows[windowId] = entry;
		scheduleManifestWrite();
		return { positioned: true };
	},
);

// The hub realm's reply to a `window:close-requested`: the named window may now
// close. Closing the hub means quitting, which force-allows every subsequent
// close so children tear down cleanly; closing a satellite marks it clear for
// its next close event and triggers that close.
ipcMain.on("window:allow-close", (_event, windowId) => {
	if (windowId === HUB_WINDOW_ID) {
		quitting = true;
		app.quit();
		return;
	}
	allowClose.add(windowId);
	for (const window of BrowserWindow.getAllWindows()) {
		if (
			!window.isDestroyed() &&
			windowIdByWc.get(window.webContents.id) === windowId
		) {
			window.close();
			return;
		}
	}
});

// Bind the calling renderer's OS window to a workspace window id so main tracks
// its geometry under that id. The hub is bound at creation, so calling this for
// non-hub ids is the satellite seam (WS-C1/B4): the hub opens a satellite via
// window.open, the satellite renderer calls this, and main restores the
// persisted geometry and begins tracking. Satellite lifecycle itself is not
// built here. Returns the persisted `{ bounds, maximized }` for the id, if any.
ipcMain.handle(
	"windowManifest:associateWindow",
	(event, { windowId }) => {
		const window = BrowserWindow.fromWebContents(event.sender);
		if (!window || typeof windowId !== "string") {
			return null;
		}
		const entry = manifestState.windows[windowId] ?? null;
		if (windowId !== HUB_WINDOW_ID && entry?.bounds) {
			window.setBounds(entry.bounds);
			if (entry.maximized) {
				window.maximize();
			}
		}
		trackWindowBounds(window, windowId);
		return entry;
	},
);

let gameLaunch = null;
ipcMain.handle("openGameWindow", () => {
	// One run at a time: ignore a launch while a game is already launching or
	// running. The phase (broadcast to every window) is the source of truth.
	if (playtestPhase !== "idle") {
		return { phase: playtestPhase };
	}
	setPlaytestPhase("launching");
	gameLaunch = launchGame().finally(() => {
		gameLaunch = null;
	});
	return gameLaunch;
});

ipcMain.handle("playtest:read", () => playtestPhase);

app.on(
	"certificate-error",
	(event, _webContents, url, _error, _certificate, callback) => {
		if (new URL(url).hostname === "localhost") {
			event.preventDefault();
			callback(true);
		} else {
			callback(false);
		}
	},
);

void app.whenReady().then(() => {
	registerSaveStoreIpc(
		ipcMain,
		path.join(app.getPath("userData"), "saves"),
	);
	manifestPath = path.join(
		app.getPath("userData"),
		"window-manifest.json",
	);
	loadManifest();
	return createWindow();
});

app.on("before-quit", () => {
	quitting = true;
	flushManifest();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
