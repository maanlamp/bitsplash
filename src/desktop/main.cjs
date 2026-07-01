const {
	app,
	BrowserWindow,
	Menu,
	ipcMain,
	dialog,
	protocol,
	net,
} = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { pathToFileURL } = require("node:url");

const DEV_URL = "https://localhost:5173";
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

const assetEntry = (name, relPath) => {
	const lower = name.toLowerCase();
	return {
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
};

const walkAssets = async (dir, base, out) => {
	const dirents = await fsp.readdir(dir, { withFileTypes: true });
	for (const dirent of dirents) {
		const full = path.join(dir, dirent.name);
		const rel = path.join(base, dirent.name);
		if (dirent.isDirectory()) {
			await walkAssets(full, rel, out);
		} else {
			out.push(assetEntry(dirent.name, rel));
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

ipcMain.handle(
	"uploadAsset",
	async (_event, { filename, dataBase64, overwrite }) => {
		const safe = path.basename(filename);
		const dest = path.join(ASSETS_DIR, safe);
		const url = `/src/game/content/assets/${safe}`;
		if (fs.existsSync(dest) && !overwrite) {
			return { url, existed: true };
		}
		await fsp.writeFile(dest, Buffer.from(dataBase64, "base64"));
		return { url, existed: false };
	},
);

ipcMain.handle("getAssetsRoot", async () => ({ path: ASSETS_DIR }));

ipcMain.handle("listDir", async (_event, { path: dir }) => {
	const dirents = await fsp.readdir(dir, { withFileTypes: true });
	const entries = dirents.map((dirent) => ({
		name: dirent.name,
		path: path.join(dir, dirent.name),
		isDirectory: dirent.isDirectory(),
	}));
	return { entries, parent: path.dirname(dir) };
});

ipcMain.handle("listAssetsDeep", async () => {
	const out = [];
	await walkAssets(ASSETS_DIR, "", out);
	out
		.sort((a, b) => a.name.localeCompare(b.name))
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
			{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] },
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
	protocol.handle(FS_SCHEME, (request) => {
		const url = new URL(request.url);
		const filePath = decodeURIComponent(
			url.pathname.replace(/^\//, ""),
		);
		return net.fetch(pathToFileURL(filePath).toString());
	});
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
			zoomFactor: 2 / 3,
		},
	});

	window.webContents.openDevTools();

	void window.loadURL(DEV_URL);
};

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

void app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
