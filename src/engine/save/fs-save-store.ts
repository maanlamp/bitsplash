import type { SaveBlob, SaveStore } from "./save-store";

export type SaveStoreBridge = Readonly<{
	list(): Promise<ReadonlyArray<string>>;
	read(slot: string): Promise<SaveBlob | undefined>;
	write(slot: string, blob: SaveBlob): Promise<void>;
	delete(slot: string): Promise<void>;
}>;

const injectedBridge = (): SaveStoreBridge | undefined =>
	(globalThis as { saveStore?: SaveStoreBridge }).saveStore;

export const hasFsSaveStore = (): boolean =>
	injectedBridge() !== undefined;

export class FsSaveStore implements SaveStore {
	private readonly bridge: SaveStoreBridge;

	constructor(
		bridge: SaveStoreBridge | undefined = injectedBridge(),
	) {
		if (!bridge) {
			throw new Error(
				"FsSaveStore requires the Electron save bridge (window.saveStore); run inside the desktop shell.",
			);
		}
		this.bridge = bridge;
	}

	list(): Promise<ReadonlyArray<string>> {
		return this.bridge.list();
	}

	async read(slot: string): Promise<SaveBlob | undefined> {
		const blob = await this.bridge.read(slot);
		return blob === undefined ? undefined : new Uint8Array(blob);
	}

	write(slot: string, blob: SaveBlob): Promise<void> {
		return this.bridge.write(slot, blob);
	}

	delete(slot: string): Promise<void> {
		return this.bridge.delete(slot);
	}
}
