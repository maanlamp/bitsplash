export type SaveBlob = Uint8Array;

export interface SaveStore {
	list(): Promise<ReadonlyArray<string>>;
	read(slot: string): Promise<SaveBlob | undefined>;
	write(slot: string, blob: SaveBlob): Promise<void>;
	delete(slot: string): Promise<void>;
}
