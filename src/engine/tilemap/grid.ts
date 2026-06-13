export type GridBounds = Readonly<{
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}>;

export class TileGrid {
	private cells: Set<string> = new Set();
	private listeners: Set<() => void> = new Set();
	private notifyScheduled = false;

	private key(gx: number, gy: number): string {
		return `${gx},${gy}`;
	}

	setTile(gx: number, gy: number): void {
		const k = this.key(gx, gy);
		if (this.cells.has(k)) {
			return;
		}
		this.cells.add(k);
		this.notify();
	}

	removeTile(gx: number, gy: number): void {
		if (!this.cells.delete(this.key(gx, gy))) {
			return;
		}
		this.notify();
	}

	hasTile(gx: number, gy: number): boolean {
		return this.cells.has(this.key(gx, gy));
	}

	occupiedCells(): ReadonlyArray<readonly [number, number]> {
		const out: Array<readonly [number, number]> = [];
		for (const k of this.cells) {
			const [gx, gy] = k.split(",").map(Number) as [number, number];
			out.push([gx, gy]);
		}
		return out;
	}

	bounds(): GridBounds | null {
		if (this.cells.size === 0) {
			return null;
		}
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const k of this.cells) {
			const [gx, gy] = k.split(",").map(Number) as [number, number];
			minX = Math.min(minX, gx);
			minY = Math.min(minY, gy);
			maxX = Math.max(maxX, gx);
			maxY = Math.max(maxY, gy);
		}
		return { minX, minY, maxX, maxY };
	}

	clear(): void {
		if (this.cells.size === 0) {
			return;
		}
		this.cells.clear();
		this.notify();
	}

	onChange(cb: () => void): () => void {
		this.listeners.add(cb);
		return () => {
			this.listeners.delete(cb);
		};
	}

	private notify(): void {
		if (this.notifyScheduled) {
			return;
		}
		this.notifyScheduled = true;
		queueMicrotask(() => {
			this.notifyScheduled = false;
			for (const cb of this.listeners) {
				cb();
			}
		});
	}
}
