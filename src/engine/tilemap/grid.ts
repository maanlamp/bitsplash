export type GridBounds = Readonly<{
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}>;

/**
 * Half the width of one packed axis: the largest tile coordinate magnitude a
 * cell key can carry, in either direction.
 */
const CELL_BIAS = 1 << 20;

/** Distance between two packed keys one grid row apart. */
const CELL_STRIDE = 1 << 21;

/**
 * The lowest tile coordinate {@link tileCellKey} can pack, on both axes.
 *
 * At 16px tiles this is roughly ±16.7 million world units per axis — orders of
 * magnitude beyond any authored level.
 */
export const CELL_COORD_MIN = -CELL_BIAS;

/** The highest tile coordinate {@link tileCellKey} can pack, on both axes. */
export const CELL_COORD_MAX = CELL_BIAS - 1;

/**
 * The key a tile cell is stored under in {@link TileGrid} and in every merged
 * cell set derived from one, so callers testing a coordinate cannot spell the
 * format differently than the sets do.
 *
 * Both coordinates are biased into a non-negative range and packed into one
 * integer, `(gy + BIAS) * STRIDE + (gx + BIAS)`. Valid for coordinates in
 * [{@link CELL_COORD_MIN}, {@link CELL_COORD_MAX}]; the largest packed value is
 * under 2^42, well inside the double-safe integer range, so a key is a plain
 * number and a lookup allocates nothing.
 *
 * @example
 * mergedBlockingCells(ecs, "rain-blocking").has(tileCellKey(gx, gy));
 */
export const tileCellKey = (gx: number, gy: number): number =>
	(gy + CELL_BIAS) * CELL_STRIDE + (gx + CELL_BIAS);

/** The `gx` of a key produced by {@link tileCellKey}. */
export const cellKeyX = (key: number): number =>
	(key % CELL_STRIDE) - CELL_BIAS;

/** The `gy` of a key produced by {@link tileCellKey}. */
export const cellKeyY = (key: number): number =>
	(key - (key % CELL_STRIDE)) / CELL_STRIDE - CELL_BIAS;

/**
 * A set of occupied tile cells, keyed by {@link tileCellKey}.
 *
 * `bounds()` is O(1) and hands back one grid-owned object; `cellKeys()` and
 * `forEachCell()` iterate without materialising anything. Only `occupiedCells()`
 * allocates, and it exists for callers that genuinely want a snapshot array.
 */
export class TileGrid {
	private cells: Set<number> = new Set();
	private listeners: Set<() => void> = new Set();
	private notifyScheduled = false;
	private readonly boundsValue = {
		minX: 0,
		minY: 0,
		maxX: 0,
		maxY: 0,
	};
	private boundsStale = false;

	version = 0;

	setTile(gx: number, gy: number): void {
		const k = tileCellKey(gx, gy);
		if (this.cells.has(k)) {
			return;
		}
		if (this.cells.size === 0) {
			this.boundsValue.minX = gx;
			this.boundsValue.minY = gy;
			this.boundsValue.maxX = gx;
			this.boundsValue.maxY = gy;
			this.boundsStale = false;
		} else {
			const b = this.boundsValue;
			b.minX = Math.min(b.minX, gx);
			b.minY = Math.min(b.minY, gy);
			b.maxX = Math.max(b.maxX, gx);
			b.maxY = Math.max(b.maxY, gy);
		}
		this.cells.add(k);
		this.version += 1;
		this.notify();
	}

	removeTile(gx: number, gy: number): void {
		if (!this.cells.delete(tileCellKey(gx, gy))) {
			return;
		}
		const b = this.boundsValue;
		if (
			gx === b.minX ||
			gx === b.maxX ||
			gy === b.minY ||
			gy === b.maxY
		) {
			this.boundsStale = true;
		}
		this.version += 1;
		this.notify();
	}

	hasTile(gx: number, gy: number): boolean {
		return this.cells.has(tileCellKey(gx, gy));
	}

	/** The occupied cells as packed {@link tileCellKey} values. */
	cellKeys(): ReadonlySet<number> {
		return this.cells;
	}

	/** Visit every occupied cell's grid coordinates, allocating nothing. */
	forEachCell(visit: (gx: number, gy: number) => void): void {
		for (const k of this.cells) {
			visit(cellKeyX(k), cellKeyY(k));
		}
	}

	/**
	 * A fresh array of the occupied cells as coordinate tuples.
	 *
	 * Allocates two objects per tile — never call it from a frame loop; use
	 * {@link forEachCell} or {@link cellKeys} there.
	 */
	occupiedCells(): ReadonlyArray<readonly [number, number]> {
		const out: Array<readonly [number, number]> = [];
		for (const k of this.cells) {
			out.push([cellKeyX(k), cellKeyY(k)]);
		}
		return out;
	}

	/**
	 * The extent of the occupied cells, or `null` when the grid is empty.
	 *
	 * The returned object is owned by the grid and is rewritten in place when a
	 * later edit changes the extent — copy it if you need it to outlive the edit.
	 */
	bounds(): GridBounds | null {
		if (this.cells.size === 0) {
			return null;
		}
		if (this.boundsStale) {
			this.recomputeBounds();
		}
		return this.boundsValue;
	}

	clear(): void {
		if (this.cells.size === 0) {
			return;
		}
		this.cells.clear();
		this.boundsStale = false;
		this.version += 1;
		this.notify();
	}

	onChange(cb: () => void): () => void {
		this.listeners.add(cb);
		return () => {
			this.listeners.delete(cb);
		};
	}

	private recomputeBounds(): void {
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const k of this.cells) {
			const gx = cellKeyX(k);
			const gy = cellKeyY(k);
			if (gx < minX) {
				minX = gx;
			}
			if (gx > maxX) {
				maxX = gx;
			}
			if (gy < minY) {
				minY = gy;
			}
			if (gy > maxY) {
				maxY = gy;
			}
		}
		this.boundsValue.minX = minX;
		this.boundsValue.minY = minY;
		this.boundsValue.maxX = maxX;
		this.boundsValue.maxY = maxY;
		this.boundsStale = false;
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
