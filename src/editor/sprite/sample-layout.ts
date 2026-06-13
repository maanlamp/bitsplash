import type { TileGrid } from "../../engine/tilemap/grid";
import { HALF_TILE_SIZE, TILE_SIZE } from "../../engine/tile";
import Vector2 from "../../engine/vector2";

export const SAMPLE_CELLS: ReadonlyArray<readonly [number, number]> =
	[
		[0, 0],
		[1, 0],
		[2, 0],
		[3, 0],
		[0, 1],
		[1, 1],
		[2, 1],
		[3, 1],
		[0, 2],
		[1, 2],
		[2, 2],
		[3, 2],
		[5, 0],
		[6, 0],
		[7, 0],
		[5, 1],
		[6, 1],
		[5, 2],
		[6, 2],
		[7, 2],
		[1, 4],
		[2, 5],
	];

export const populateSampleGrid = (grid: TileGrid): void => {
	for (const [x, y] of SAMPLE_CELLS) {
		grid.setTile(x, y);
	}
};

export type SampleBounds = Readonly<{ min: Vector2; max: Vector2 }>;

export const sampleBounds = (): SampleBounds => {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const [x, y] of SAMPLE_CELLS) {
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	}
	return {
		min: new Vector2(
			minX * TILE_SIZE - HALF_TILE_SIZE,
			minY * TILE_SIZE - HALF_TILE_SIZE,
		),
		max: new Vector2(
			(maxX + 1) * TILE_SIZE + HALF_TILE_SIZE,
			(maxY + 1) * TILE_SIZE + HALF_TILE_SIZE,
		),
	};
};
