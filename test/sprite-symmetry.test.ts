import { describe, expect, test } from "bun:test";
import { mirrorCells } from "../src/editor/sprite/symmetry";

describe("symmetry mirroring", () => {
	test("off returns just the original cell", () => {
		expect(mirrorCells("off", 8, 8, 1, 3)).toEqual([[1, 3]]);
	});

	test("horizontal mirrors across the vertical centre (x → w-1-x)", () => {
		expect(mirrorCells("horizontal", 8, 8, 1, 3)).toEqual([
			[1, 3],
			[6, 3],
		]);
	});

	test("vertical mirrors across the horizontal centre (y → h-1-y)", () => {
		expect(mirrorCells("vertical", 8, 8, 1, 3)).toEqual([
			[1, 3],
			[1, 4],
		]);
	});

	test("a cell on the centre axis of an odd dimension is not duplicated", () => {
		expect(mirrorCells("horizontal", 5, 5, 2, 1)).toEqual([[2, 1]]);
		expect(mirrorCells("vertical", 5, 5, 1, 2)).toEqual([[1, 2]]);
	});

	test("the original cell is always first", () => {
		expect(mirrorCells("horizontal", 8, 8, 0, 0)[0]).toEqual([0, 0]);
	});
});
