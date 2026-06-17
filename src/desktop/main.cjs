const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const DEV_URL = "http://localhost:5173";
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const LEVELS_DIR = path.join(PROJECT_ROOT, "src", "game", "levels");
const ASSETS_DIR = path.join(PROJECT_ROOT, "src", "game", "assets");

ipcMain.handle("saveLevel", async (_event, { sceneId, json }) => {
	const id = /^[\w-]+$/.test(sceneId) ? sceneId : "demo";
	await fsp.writeFile(
		path.join(LEVELS_DIR, `${id}.scene.json`),
		json,
	);
	return { saved: true };
});

ipcMain.handle(
	"uploadAsset",
	async (_event, { filename, dataBase64, overwrite }) => {
		const safe = path.basename(filename);
		const dest = path.join(ASSETS_DIR, safe);
		const url = `/src/game/assets/${safe}`;
		if (fs.existsSync(dest) && !overwrite) {
			return { url, existed: true };
		}
		await fsp.writeFile(dest, Buffer.from(dataBase64, "base64"));
		return { url, existed: false };
	},
);

const waitForDevServer = async () => {
	for (let attempt = 0; attempt < 200; attempt++) {
		try {
			await fetch(DEV_URL, { method: "HEAD" });
			return true;
		} catch {
			await new Promise((done) => setTimeout(done, 150));
		}
	}
	return false;
};

const createWindow = async () => {
	Menu.setApplicationMenu(null);
	const window = new BrowserWindow({
		width: 1400,
		height: 900,
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
			zoomFactor: 2 / 3,
		},
	});
	if (await waitForDevServer()) {
		await window.loadURL(DEV_URL);
	} else {
		await window.loadFile(
			path.join(PROJECT_ROOT, "dist", "index.html"),
		);
	}
};

void app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
