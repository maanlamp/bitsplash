const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bitsplashDesktop", {
	saveLevel: (payload) => ipcRenderer.invoke("saveLevel", payload),
	writeAssetAtomic: (payload) =>
		ipcRenderer.invoke("writeAssetAtomic", payload),
	getAssetsRoot: () => ipcRenderer.invoke("getAssetsRoot"),
	readTextFile: (payload) =>
		ipcRenderer.invoke("readTextFile", payload),
	readBinaryFile: (payload) =>
		ipcRenderer.invoke("readBinaryFile", payload),
	capturePage: () => ipcRenderer.invoke("capturePage"),
	listDir: (payload) => ipcRenderer.invoke("listDir", payload),
	listAssetsDeep: () => ipcRenderer.invoke("listAssetsDeep"),
	rename: (payload) => ipcRenderer.invoke("rename", payload),
	mkdir: (payload) => ipcRenderer.invoke("mkdir", payload),
	del: (payload) => ipcRenderer.invoke("del", payload),
	restore: (payload) => ipcRenderer.invoke("restore", payload),
	openImageDialog: () => ipcRenderer.invoke("openImageDialog"),
	openFileDialog: (payload) =>
		ipcRenderer.invoke("openFileDialog", payload),
});

// Editor-global playtest (the separate game process). Main owns the
// launch/running phase and broadcasts changes; every window subscribes so its
// global playtest icon reflects the same state (WS-F).
contextBridge.exposeInMainWorld("gamePlaytest", {
	launch: () => ipcRenderer.invoke("openGameWindow"),
	read: () => ipcRenderer.invoke("playtest:read"),
	onStateChanged: (listener) => {
		const handler = (_event, phase) => listener(phase);
		ipcRenderer.on("playtest:state", handler);
		return () =>
			ipcRenderer.removeListener("playtest:state", handler);
	},
});

contextBridge.exposeInMainWorld("windowManifest", {
	read: () => ipcRenderer.invoke("windowManifest:read"),
	associateWindow: (windowId) =>
		ipcRenderer.invoke("windowManifest:associateWindow", {
			windowId,
		}),
	onZoomChanged: (listener) => {
		const handler = (_event, percent) => listener(percent);
		ipcRenderer.on("zoom-changed", handler);
		return () => ipcRenderer.removeListener("zoom-changed", handler);
	},
});

contextBridge.exposeInMainWorld("windowControls", {
	onCloseRequested: (listener) => {
		const handler = (_event, windowId) => listener(windowId);
		ipcRenderer.on("window:close-requested", handler);
		return () =>
			ipcRenderer.removeListener("window:close-requested", handler);
	},
	allowClose: (windowId) =>
		ipcRenderer.send("window:allow-close", windowId),
});

contextBridge.exposeInMainWorld("desktopDrag", {
	snapshot: () => ipcRenderer.invoke("desktop:dragSnapshot"),
	positionWindow: (windowId, bounds) =>
		ipcRenderer.invoke("desktop:positionWindow", {
			windowId,
			bounds,
		}),
});

contextBridge.exposeInMainWorld("saveStore", {
	list: () => ipcRenderer.invoke("saveStore:list"),
	read: (slot) => ipcRenderer.invoke("saveStore:read", { slot }),
	write: (slot, blob) =>
		ipcRenderer.invoke("saveStore:write", { slot, blob }),
	delete: (slot) => ipcRenderer.invoke("saveStore:delete", { slot }),
});
