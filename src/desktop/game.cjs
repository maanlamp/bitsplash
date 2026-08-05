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

app.commandLine.appendSwitch("disable-gpu-vsync");
app.commandLine.appendSwitch("disable-frame-rate-limit");

process.on("disconnect", () => {
	app.quit();
});

const devUrl = process.env.BITSPLASH_DEV_URL;

// Set BITSPLASH_PROFILE to turn the game's per-system FrameProfile on: the
// marker rides the loaded URL and `engine/runtime/host.ts` reads it. Wall-clock
// frame timing comes from Chromium's own tracing over --remote-debugging-port,
// because collecting per-system spans perturbs the frame it measures.
const PROFILE_QUERY = process.env.BITSPLASH_PROFILE ? "?profile" : "";

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
		},
	});

	window.webContents.once("did-finish-load", () => {
		process.send?.(GAME_READY_MESSAGE);
	});
	if (devUrl) {
		void window.loadURL(`${devUrl}/game.html${PROFILE_QUERY}`);
	} else {
		serveDist();
		void window.loadURL(
			`${APP_SCHEME}://bundle/game.html${PROFILE_QUERY}`,
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
