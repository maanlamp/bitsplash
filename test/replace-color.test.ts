import { describe, expect, test } from "bun:test";
import type { PixelBuffer } from "../src/editor/sprite/pixel-buffer";
import {
	type Rgba,
	replaceColor,
} from "../src/editor/sprite/replace-color";

const buffer = (
	width: number,
	height: number,
	cells: ReadonlyArray<Rgba>,
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

const RED: Rgba = [255, 0, 0, 255];
const BLUE: Rgba = [0, 0, 255, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

const cellsOf = (pixels: PixelBuffer): Rgba[] => {
	const out: Rgba[] = [];
	for (let i = 0; i < pixels.data.length; i += 4) {
		out.push([
			pixels.data[i]!,
			pixels.data[i + 1]!,
			pixels.data[i + 2]!,
			pixels.data[i + 3]!,
		]);
	}
	return out;
};

describe("replace colour", () => {
	test("exact match replaces every matching pixel, leaves others", () => {
		const cel = buffer(2, 2, [RED, BLUE, RED, CLEAR]);
		const out = replaceColor(cel, RED, BLUE, 0);
		expect(cellsOf(out)).toEqual([BLUE, BLUE, BLUE, CLEAR]);
	});

	test("does not mutate the input buffer", () => {
		const cel = buffer(1, 1, [RED]);
		const before = Uint8ClampedArray.from(cel.data);
		replaceColor(cel, RED, BLUE, 0);
		expect(cel.data).toEqual(before);
	});

	test("alpha is part of the match: opaque red ≠ transparent same-rgb", () => {
		const transparentRed: Rgba = [255, 0, 0, 0];
		const cel = buffer(2, 1, [RED, transparentRed]);
		const out = replaceColor(cel, RED, BLUE, 0);
		expect(cellsOf(out)).toEqual([BLUE, transparentRed]);
	});

	test("replacing to a transparent colour erases the region", () => {
		const cel = buffer(1, 1, [RED]);
		const out = replaceColor(cel, RED, CLEAR, 0);
		expect(cellsOf(out)).toEqual([CLEAR]);
	});

	test("tolerance catches near colours inclusively", () => {
		const near: Rgba = [245, 0, 0, 255];
		const cel = buffer(2, 1, [RED, near]);
		expect(cellsOf(replaceColor(cel, RED, BLUE, 9))).toEqual([
			BLUE,
			near,
		]);
		expect(cellsOf(replaceColor(cel, RED, BLUE, 10))).toEqual([
			BLUE,
			BLUE,
		]);
	});

	test("no match leaves the buffer unchanged", () => {
		const cel = buffer(1, 1, [BLUE]);
		expect(
			cellsOf(replaceColor(cel, RED, [1, 2, 3, 255], 0)),
		).toEqual([BLUE]);
	});
});
