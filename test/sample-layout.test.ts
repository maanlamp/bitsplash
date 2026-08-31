const has = (x: number, y: number) =>
	SAMPLE_CELLS.some(([cx, cy]) => cx === x && cy === y);

import { describe, expect, test } from "bun:test";
import {
	classifyCorner,
	Variant,
} from "../src/engine/tilemap/autotile";
import { TileGrid } from "../src/engine/tilemap/grid";
import {
	HALF_TILE_SIZE,
	TILE_SIZE,
} from "../src/engine/tilemap/tile";
import {
	SAMPLE_CELLS,
	populateSampleGrid,
	sampleBounds,
} from "../src/editor/sprite/sample-layout";

describe("tileset sample layout", () => {
	test("has no duplicate cells", () => {
		const keys = SAMPLE_CELLS.map(([x, y]) => `${x},${y}`);
		expect(new Set(keys).size).toBe(keys.length);
	});

	test("includes the extended neighbourhoods (staircase + isolated tile)", () => {
		for (const [x, y] of [
			[8, 0],
			[9, 1],
			[10, 2],
			[8, 4],
			[10, 4],
			[10, 5],
		]) {
			expect(has(x!, y!)).toBe(true);
		}
	});

	test("populateSampleGrid stamps exactly the sample cells", () => {
		const grid = new TileGrid();
		populateSampleGrid(grid);
		expect(grid.occupiedCells().length).toBe(SAMPLE_CELLS.length);
		for (const [x, y] of SAMPLE_CELLS) {
			expect(grid.hasTile(x, y)).toBe(true);
		}
	});

	test("sampleBounds frames the min/max cells with a half-tile margin", () => {
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
		const bounds = sampleBounds();
		expect(bounds.min.x).toBe(minX * TILE_SIZE - HALF_TILE_SIZE);
		expect(bounds.min.y).toBe(minY * TILE_SIZE - HALF_TILE_SIZE);
		expect(bounds.max.x).toBe(
			(maxX + 1) * TILE_SIZE + HALF_TILE_SIZE,
		);
		expect(bounds.max.y).toBe(
			(maxY + 1) * TILE_SIZE + HALF_TILE_SIZE,
		);
	});

	test("exercises a broad spread of autotile corner variants", () => {
		const grid = new TileGrid();
		populateSampleGrid(grid);
		const { minX, minY, maxX, maxY } = grid.bounds()!;
		const variants = new Set<number>();
		for (let cy = minY; cy <= maxY + 1; cy++) {
			for (let cx = minX; cx <= maxX + 1; cx++) {
				const { variant } = classifyCorner(
					grid.hasTile(cx - 1, cy - 1),
					grid.hasTile(cx, cy - 1),
					grid.hasTile(cx, cy),
					grid.hasTile(cx - 1, cy),
				);
				variants.add(variant);
			}
		}
		for (const v of [
			Variant.CORNER,
			Variant.EDGE,
			Variant.DIAGONAL,
			Variant.INV_CORNER,
			Variant.FULL,
		]) {
			expect(variants.has(v)).toBe(true);
		}
	});
});
