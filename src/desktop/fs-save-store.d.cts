export type FsSaveStoreImpl = {
	list(): Promise<string[]>;
	read(slot: string): Promise<Uint8Array | undefined>;
	write(slot: string, blob: Uint8Array): Promise<void>;
	delete(slot: string): Promise<void>;
};

export function fsSaveStoreImpl(dir: string): FsSaveStoreImpl;

export function registerSaveStoreIpc(
	ipcMain: unknown,
	dir: string,
): void;
