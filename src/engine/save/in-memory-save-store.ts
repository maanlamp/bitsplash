import type { SaveBlob, SaveStore } from "./save-store";

export class InMemorySaveStore implements SaveStore {
	private readonly slots = new Map<string, SaveBlob>();

	list(): Promise<ReadonlyArray<string>> {
		return Promise.resolve([...this.slots.keys()]);
	}

	read(slot: string): Promise<SaveBlob | undefined> {
		const blob = this.slots.get(slot);
		return Promise.resolve(blob ? blob.slice() : undefined);
	}

	write(slot: string, blob: SaveBlob): Promise<void> {
		this.slots.set(slot, blob.slice());
		return Promise.resolve();
	}

	delete(slot: string): Promise<void> {
		this.slots.delete(slot);
		return Promise.resolve();
	}
}
