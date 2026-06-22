const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bitsplashDesktop", {
	saveLevel: (payload) => ipcRenderer.invoke("saveLevel", payload),
	uploadAsset: (payload) =>
		ipcRenderer.invoke("uploadAsset", payload),
	getAssetsRoot: () => ipcRenderer.invoke("getAssetsRoot"),
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
