const {
	app,
	BrowserWindow,
	Menu,
	ipcMain,
	protocol,
} = require("electron");
const path = require("node:path");
const fsp = require("node:fs/promises");
const { registerSaveStoreIpc } = require("./fs-save-store.cjs");
const { GAME_READY_MESSAGE } = require("./game-ready.cjs");

// The playtest runs this game shell as a child of the editor. Give it its own
// "Bitsplash Playtest" userData so it never shares the editor's Chromium cache
// dir — the source of the shared-cache "Access is denied" launch failures — and
// reads as the editor's test harness rather than the shipped game. Must run
// before userData is read.
app.setName("Bitsplash Playtest");

// One game window per userData profile. Two are never wanted, and under `vite`
// they are actively harmful: each page carries its own QA bridge on the shared
// HMR channel, so a stale window answers `scripts/probe.ts` and silently
// attributes its own frame times and counters to the run under test.
if (!app.requestSingleInstanceLock()) {
	app.quit();
}

app.commandLine.appendSwitch("disable-gpu-vsync");
app.commandLine.appendSwitch("disable-frame-rate-limit");

// Under BITSPLASH_QA, expose CDP so `scripts/frame-trace.ts` can read Chromium's
// own compositor trace. Presented-frame timing cannot be observed from the page:
// requestAnimationFrame reports main-thread callback cadence, which keeps to
// schedule even while the compositor falls behind, so a page-side number can look
// healthy while the picture visibly stutters.
if (process.env.BITSPLASH_QA) {
	app.commandLine.appendSwitch(
		"remote-debugging-port",
		process.env.BITSPLASH_CDP_PORT || "9222",
	);
}

process.on("disconnect", () => {
	app.quit();
});

const devUrl = process.env.BITSPLASH_DEV_URL;

// Set BITSPLASH_PROFILE to turn the game's per-system FrameProfile on: the
// marker rides the loaded URL and `engine/runtime/host.ts` reads it. Wall-clock
// frame timing comes from Chromium's own tracing over --remote-debugging-port,
// because collecting per-system spans perturbs the frame it measures.
const PROFILE_QUERY = process.env.BITSPLASH_PROFILE ? "profile" : "";

// Extra query parameters for the loaded page, so a QA run can select a code path
// the page reads from its own URL without needing a bespoke shell per switch.
// e.g. BITSPLASH_QUERY=domui=dom-hidden
const EXTRA_QUERY = process.env.BITSPLASH_QUERY || "";

const QUERY = [PROFILE_QUERY, EXTRA_QUERY].filter(Boolean).join("&");
const QUERY_SUFFIX = QUERY ? `?${QUERY}` : "";

if (devUrl) {
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
}

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DIST_DIR = path.join(PROJECT_ROOT, "dist");
const APP_SCHEME = "app";

const MIME = {
	".html": "text/html",
	".js": "text/javascript",
	".mjs": "text/javascript",
	".css": "text/css",
	".wasm": "application/wasm",
	".json": "application/json",
	".map": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".otf": "font/otf",
	".zip": "application/zip",
	".bsprite": "application/zip",
	".wav": "audio/wav",
	".mp3": "audio/mpeg",
	".ogg": "audio/ogg",
};

protocol.registerSchemesAsPrivileged([
	{
		scheme: APP_SCHEME,
		privileges: {
			standard: true,
			secure: true,
			supportFetchAPI: true,
			stream: true,
		},
	},
]);

const serveDist = () => {
	protocol.handle(APP_SCHEME, async (request) => {
		const { pathname } = new URL(request.url);
		const rel =
			decodeURIComponent(pathname).replace(/^\/+/, "") || "game.html";
		const root = rel.startsWith("src/") ? PROJECT_ROOT : DIST_DIR;
		const filePath = path.join(root, rel);
		if (!filePath.startsWith(root)) {
			return new Response("forbidden", { status: 403 });
		}
		try {
			const data = await fsp.readFile(filePath);
			const ext = path.extname(filePath).toLowerCase();
			return new Response(data, {
				headers: {
					"content-type": MIME[ext] ?? "application/octet-stream",
				},
			});
		} catch {
			return new Response("not found", { status: 404 });
		}
	});
};

const createGameWindow = () => {
	Menu.setApplicationMenu(null);
	const window = new BrowserWindow({
		width: 1280,
		height: 720,
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
			// Chromium throttles requestAnimationFrame in a window that is not
			// frontmost, which silently ruins any frame-time measurement taken
			// while a terminal has focus. Off only under BITSPLASH_QA, so the
			// shipping window keeps Chromium's default behaviour.
			...(process.env.BITSPLASH_QA
				? { backgroundThrottling: false }
				: {}),
		},
	});

	if (process.env.BITSPLASH_QA) {
		window.once("ready-to-show", () => {
			window.show();
			window.focus();
		});
	}

	window.webContents.once("did-finish-load", () => {
		process.send?.(GAME_READY_MESSAGE);
	});
	if (devUrl) {
		void window.loadURL(`${devUrl}/game.html${QUERY_SUFFIX}`);
	} else {
		serveDist();
		void window.loadURL(
			`${APP_SCHEME}://bundle/game.html${QUERY_SUFFIX}`,
		);
	}
};

void app.whenReady().then(() => {
	registerSaveStoreIpc(
		ipcMain,
		path.join(app.getPath("userData"), "saves"),
	);
	return createGameWindow();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
