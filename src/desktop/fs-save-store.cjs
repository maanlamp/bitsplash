const fsp = require("node:fs/promises");
const path = require("node:path");

const EXTENSION = ".sav";

const fsSaveStoreImpl = (dir) => {
	const fileFor = (slot) => path.join(dir, `${slot}${EXTENSION}`);
	return {
		async list() {
			let names;
			try {
				names = await fsp.readdir(dir);
			} catch (error) {
				if (error && error.code === "ENOENT") {
					return [];
				}
				throw error;
			}
			return names
				.filter((name) => name.endsWith(EXTENSION))
				.map((name) => name.slice(0, -EXTENSION.length));
		},
		async read(slot) {
			try {
				const buffer = await fsp.readFile(fileFor(slot));
				return new Uint8Array(
					buffer.buffer,
					buffer.byteOffset,
					buffer.byteLength,
				);
			} catch (error) {
				if (error && error.code === "ENOENT") {
					return undefined;
				}
				throw error;
			}
		},
		async write(slot, blob) {
			await fsp.mkdir(dir, { recursive: true });
			await fsp.writeFile(fileFor(slot), Buffer.from(blob));
		},
		async delete(slot) {
			try {
				await fsp.rm(fileFor(slot));
			} catch (error) {
				if (error && error.code === "ENOENT") {
					return;
				}
				throw error;
			}
		},
	};
};

const registerSaveStoreIpc = (ipcMain, dir) => {
	const store = fsSaveStoreImpl(dir);
	ipcMain.handle("saveStore:list", () => store.list());
	ipcMain.handle("saveStore:read", (_event, { slot }) =>
		store.read(slot),
	);
	ipcMain.handle("saveStore:write", (_event, { slot, blob }) =>
		store.write(slot, blob),
	);
	ipcMain.handle("saveStore:delete", (_event, { slot }) =>
		store.delete(slot),
	);
};

module.exports = { fsSaveStoreImpl, registerSaveStoreIpc };
