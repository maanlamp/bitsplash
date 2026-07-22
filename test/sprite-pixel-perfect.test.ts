import { describe, expect, test } from "bun:test";
import {
	type Cell,
	PixelPerfectFilter,
} from "../src/editor/sprite/pixel-perfect";

/** Push a whole cell sequence, then flush; return every emitted cell in order. */
const run = (cells: ReadonlyArray<Cell>): Cell[] => {
	const pp = new PixelPerfectFilter();
	const out: Cell[] = [];
	for (const [x, y] of cells) {
		out.push(...pp.push(x, y));
	}
	out.push(...pp.flush());
	return out;
};

describe("pixel-perfect filter", () => {
	test("a staircase collapses to a clean diagonal (corners removed)", () => {
		expect(
			run([
				[0, 0],
				[1, 0],
				[1, 1],
				[2, 1],
				[2, 2],
			]),
		).toEqual([
			[0, 0],
			[1, 1],
			[2, 2],
		]);
	});

	test("a straight line is left untouched", () => {
		expect(
			run([
				[0, 0],
				[1, 0],
				[2, 0],
				[3, 0],
			]),
		).toEqual([
			[0, 0],
			[1, 0],
			[2, 0],
			[3, 0],
		]);
	});

	test("a single cell is emitted on flush", () => {
		expect(run([[4, 4]])).toEqual([[4, 4]]);
	});

	test("duplicate cells are ignored", () => {
		expect(
			run([
				[0, 0],
				[0, 0],
				[1, 0],
			]),
		).toEqual([
			[0, 0],
			[1, 0],
		]);
	});

	test("removal is lazy: a corner is only dropped once its successor arrives", () => {
		const pp = new PixelPerfectFilter();
		expect(pp.push(0, 0)).toEqual([]);
		expect(pp.push(1, 0)).toEqual([[0, 0]]);
		expect(pp.push(1, 1)).toEqual([]);
		expect(pp.push(2, 1)).toEqual([[1, 1]]);
		expect(pp.flush()).toEqual([[2, 1]]);
	});
});
