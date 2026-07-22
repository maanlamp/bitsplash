import { describe, expect, test } from "bun:test";
import { computeFill } from "../src/editor/sprite/flood-fill";
import type { PixelBuffer } from "../src/editor/sprite/pixel-buffer";

type RGBA = readonly [number, number, number, number];

/** Build a buffer from a grid of RGBA cells (row-major). */
const buffer = (
	width: number,
	height: number,
	cells: ReadonlyArray<RGBA>,
): PixelBuffer => {
	const data = new Uint8ClampedArray(width * height * 4);
	cells.forEach(([r, g, b, a], i) => {
		data[i * 4] = r;
		data[i * 4 + 1] = g;
		data[i * 4 + 2] = b;
		data[i * 4 + 3] = a;
	});
	return { width, height, data };
};

const RED: RGBA = [255, 0, 0, 255];
const BLUE: RGBA = [0, 0, 255, 255];
const CLEAR: RGBA = [0, 0, 0, 0];

const asSet = (cells: ReadonlyArray<readonly [number, number]>) =>
	new Set(cells.map(([x, y]) => `${x},${y}`));

describe("flood fill", () => {
	test("an empty cel fills entirely from any seed at tolerance 0", () => {
		const cel = buffer(2, 2, [CLEAR, CLEAR, CLEAR, CLEAR]);
		expect(computeFill(cel, 0, 0, 0, true)).toHaveLength(4);
	});

	test("out-of-bounds seed yields nothing", () => {
		const cel = buffer(2, 2, [CLEAR, CLEAR, CLEAR, CLEAR]);
		expect(computeFill(cel, 5, 5, 0, true)).toEqual([]);
	});

	test("contiguous stops at a colour boundary", () => {
		// Left column red, right column blue.
		const cel = buffer(2, 2, [RED, BLUE, RED, BLUE]);
		expect(asSet(computeFill(cel, 0, 0, 0, true))).toEqual(
			asSet([
				[0, 0],
				[0, 1],
			]),
		);
	});

	test("contiguous does not jump a gap that global reaches", () => {
		// Red at the two ends of a row, blue in the middle → disconnected reds.
		const cel = buffer(3, 1, [RED, BLUE, RED]);
		expect(computeFill(cel, 0, 0, 0, true)).toEqual([[0, 0]]);
		expect(asSet(computeFill(cel, 0, 0, 0, false))).toEqual(
			asSet([
				[0, 0],
				[2, 0],
			]),
		);
	});

	test("tolerance is inclusive at the boundary and exclusive beyond it", () => {
		const near: RGBA = [245, 0, 0, 255]; // 10 away from RED on one channel
		const cel = buffer(2, 1, [RED, near]);
		expect(computeFill(cel, 0, 0, 9, false)).toEqual([[0, 0]]);
		expect(asSet(computeFill(cel, 0, 0, 10, false))).toEqual(
			asSet([
				[0, 0],
				[1, 0],
			]),
		);
	});

	test("tolerance 255 fills everything regardless of colour", () => {
		const cel = buffer(2, 1, [RED, BLUE]);
		expect(computeFill(cel, 0, 0, 255, true)).toHaveLength(2);
	});
});
