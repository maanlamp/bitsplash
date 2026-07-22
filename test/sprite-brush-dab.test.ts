import { describe, expect, test } from "bun:test";
import { dabOffsets } from "../src/editor/sprite/brush-dab";

const asSet = (offsets: ReadonlyArray<readonly [number, number]>) =>
	new Set(offsets.map(([x, y]) => `${x},${y}`));

describe("brush dab offsets", () => {
	test("size 1 is a single centre cell for both shapes", () => {
		expect(dabOffsets("round", 1)).toEqual([[0, 0]]);
		expect(dabOffsets("square", 1)).toEqual([[0, 0]]);
	});

	test("a non-positive or fractional size floors to a valid size", () => {
		expect(dabOffsets("square", 0)).toEqual([[0, 0]]);
		expect(dabOffsets("square", 2.9)).toEqual(
			dabOffsets("square", 2),
		);
	});

	test("square covers its whole N×N bounding box", () => {
		expect(dabOffsets("square", 2)).toHaveLength(4);
		expect(dabOffsets("square", 3)).toHaveLength(9);
		expect(dabOffsets("square", 4)).toHaveLength(16);
	});

	test("square size 2 is the 2×2 block anchored at the centre cell", () => {
		expect(asSet(dabOffsets("square", 2))).toEqual(
			asSet([
				[0, 0],
				[1, 0],
				[0, 1],
				[1, 1],
			]),
		);
	});

	test("round size 3 is a plus (corners clipped), unlike square", () => {
		expect(asSet(dabOffsets("round", 3))).toEqual(
			asSet([
				[0, 0],
				[-1, 0],
				[1, 0],
				[0, -1],
				[0, 1],
			]),
		);
		expect(dabOffsets("round", 3)).not.toEqual(
			dabOffsets("square", 3),
		);
	});

	test("round is a proper subset of square at the same size", () => {
		for (const size of [4, 5, 6, 8]) {
			const round = asSet(dabOffsets("round", size));
			const square = asSet(dabOffsets("square", size));
			expect(round.size).toBeLessThan(square.size);
			for (const cell of round) {
				expect(square.has(cell)).toBe(true);
			}
		}
	});

	test("round footprints are mirror-symmetric about their centre", () => {
		const size = 5;
		const set = asSet(dabOffsets("round", size));
		for (const key of set) {
			const [x, y] = key.split(",").map(Number);
			expect(set.has(`${-x!},${y}`)).toBe(true);
			expect(set.has(`${x},${-y!}`)).toBe(true);
		}
	});
});
