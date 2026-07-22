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

app.commandLine.appendSwitch("disable-gpu-vsync");
app.commandLine.appendSwitch("disable-frame-rate-limit");

process.on("disconnect", () => {
	app.quit();
});

const devUrl = process.env.BITSPLASH_DEV_URL;

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
		void window.loadURL(`${devUrl}/game.html`);
	} else {
		serveDist();
		void window.loadURL(`${APP_SCHEME}://bundle/game.html`);
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
