const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bitsplashDesktop", {
	saveLevel: (payload) => ipcRenderer.invoke("saveLevel", payload),
	uploadAsset: (payload) =>
		ipcRenderer.invoke("uploadAsset", payload),
});
