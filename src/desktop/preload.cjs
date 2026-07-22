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
	openGameWindow: () => ipcRenderer.invoke("openGameWindow"),
});

contextBridge.exposeInMainWorld("saveStore", {
	list: () => ipcRenderer.invoke("saveStore:list"),
	read: (slot) => ipcRenderer.invoke("saveStore:read", { slot }),
	write: (slot, blob) =>
		ipcRenderer.invoke("saveStore:write", { slot, blob }),
	delete: (slot) => ipcRenderer.invoke("saveStore:delete", { slot }),
});
