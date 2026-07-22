import { describe, expect, test } from "bun:test";
import {
	type Cell,
	ellipseCells,
	lineCells,
	rectCells,
} from "../src/editor/sprite/shapes";

const asSet = (cells: ReadonlyArray<Cell>) =>
	new Set(cells.map(([x, y]) => `${x},${y}`));
const has = (cells: ReadonlyArray<Cell>, x: number, y: number) =>
	asSet(cells).has(`${x},${y}`);

describe("line rasterisation", () => {
	test("a horizontal run is inclusive of both endpoints", () => {
		expect(lineCells(0, 0, 2, 0)).toEqual([
			[0, 0],
			[1, 0],
			[2, 0],
		]);
	});

	test("a diagonal steps one cell per axis", () => {
		expect(lineCells(0, 0, 2, 2)).toEqual([
			[0, 0],
			[1, 1],
			[2, 2],
		]);
	});
});

describe("rectangle rasterisation", () => {
	test("outline is the border only; corners normalise either way", () => {
		const a = rectCells(0, 0, 2, 2, false);
		const b = rectCells(2, 2, 0, 0, false);
		expect(asSet(a)).toEqual(asSet(b));
		expect(a).toHaveLength(8);
		expect(has(a, 1, 1)).toBe(false);
	});

	test("filled covers every enclosed cell", () => {
		expect(rectCells(0, 0, 2, 2, true)).toHaveLength(9);
		expect(has(rectCells(0, 0, 2, 2, true), 1, 1)).toBe(true);
	});
});

describe("ellipse rasterisation", () => {
	test("outline touches the four extremes but not the box corners", () => {
		const cells = ellipseCells(0, 0, 4, 4, false);
		for (const [x, y] of [
			[2, 0],
			[0, 2],
			[4, 2],
			[2, 4],
		]) {
			expect(has(cells, x!, y!)).toBe(true);
		}
		expect(has(cells, 0, 0)).toBe(false);
		expect(has(cells, 4, 4)).toBe(false);
	});

	test("all outline cells stay within the bounding box", () => {
		for (const [x, y] of ellipseCells(0, 0, 4, 4, false)) {
			expect(x).toBeGreaterThanOrEqual(0);
			expect(x).toBeLessThanOrEqual(4);
			expect(y).toBeGreaterThanOrEqual(0);
			expect(y).toBeLessThanOrEqual(4);
		}
	});

	test("filled adds the interior and includes the centre", () => {
		const outline = ellipseCells(0, 0, 4, 4, false);
		const filled = ellipseCells(0, 0, 4, 4, true);
		expect(filled.length).toBeGreaterThan(outline.length);
		expect(has(filled, 2, 2)).toBe(true);
		expect(has(filled, 0, 0)).toBe(false);
	});
});
