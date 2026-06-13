import type { SerializedWorld } from "../engine/serialization/registry";
import type { TileGrid } from "../engine/tilemap/grid";

type TileRect = Readonly<{
	x: number;
	y: number;
	w: number;
	h: number;
}>;

const tileRects = (grid: TileGrid): TileRect[] => {
	const byRow = new Map<number, number[]>();
	for (const [x, y] of grid.occupiedCells()) {
		const row = byRow.get(y);
		if (row) {
			row.push(x);
		} else {
			byRow.set(y, [x]);
		}
	}

	const rects: TileRect[] = [];
	for (const y of [...byRow.keys()].sort((a, b) => a - b)) {
		const xs = byRow.get(y)!.sort((a, b) => a - b);
		let start: number | null = null;
		let prev = 0;
		for (const x of xs) {
			if (start === null) {
				start = x;
				prev = x;
			} else if (x === prev + 1) {
				prev = x;
			} else {
				rects.push({ x: start, y, w: prev - start + 1, h: 1 });
				start = x;
				prev = x;
			}
		}
		if (start !== null) {
			rects.push({ x: start, y, w: prev - start + 1, h: 1 });
		}
	}
	return rects;
};

export const exportLevelJson = (
	grid: TileGrid,
	entities: SerializedWorld,
): string =>
	JSON.stringify({ tiles: tileRects(grid), entities }, null, "\t");
