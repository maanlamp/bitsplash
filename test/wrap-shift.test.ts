import { describe, expect, test } from "bun:test";
import {
	type PixelBuffer,
	blankPixels,
} from "../src/editor/sprite/pixel-buffer";
import { wrapShift } from "../src/editor/sprite/wrap-shift";

/** A distinct colour per cell so a shift's mapping is unambiguous. */
const ramp = (width: number, height: number): PixelBuffer => {
	const buf = blankPixels(width, height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			buf.data[i] = x + 1;
			buf.data[i + 1] = y + 1;
			buf.data[i + 2] = x * height + y;
			buf.data[i + 3] = 255;
		}
	}
	return buf;
};

const at = (
	buf: PixelBuffer,
	x: number,
	y: number,
): [number, number, number, number] => {
	const i = (y * buf.width + x) * 4;
	return [
		buf.data[i]!,
		buf.data[i + 1]!,
		buf.data[i + 2]!,
		buf.data[i + 3]!,
	];
};

describe("wrapShift", () => {
	test("shift by (1,0) then (-1,0) is the identity", () => {
		const src = ramp(4, 3);
		const round = wrapShift(wrapShift(src, 1, 0), -1, 0);
		expect(round.data).toEqual(src.data);
	});

	test("shift by (0,1) then (0,-1) is the identity", () => {
		const src = ramp(4, 3);
		const round = wrapShift(wrapShift(src, 0, 1), 0, -1);
		expect(round.data).toEqual(src.data);
	});

	test("the last column wraps around to the first on a +1 shift", () => {
		const src = ramp(4, 3);
		const out = wrapShift(src, 1, 0);
		// old column 3 (last) re-enters at column 0; old column 0 moves to 1.
		expect(at(out, 0, 0)).toEqual(at(src, 3, 0));
		expect(at(out, 1, 0)).toEqual(at(src, 0, 0));
	});

	test("the top row wraps around to the bottom on a -1 vertical shift", () => {
		const src = ramp(4, 3);
		const out = wrapShift(src, 0, -1);
		// row 0 moves up and re-enters at the bottom row.
		expect(at(out, 2, 2)).toEqual(at(src, 2, 0));
	});

	test("shifting by a full dimension is a no-op", () => {
		const src = ramp(4, 3);
		expect(wrapShift(src, 4, 0).data).toEqual(src.data);
		expect(wrapShift(src, 0, 3).data).toEqual(src.data);
	});

	test("negative and over-sized offsets are reduced modulo the dimensions", () => {
		const src = ramp(4, 3);
		expect(wrapShift(src, -1, 0).data).toEqual(
			wrapShift(src, 3, 0).data,
		);
		expect(wrapShift(src, 5, 0).data).toEqual(
			wrapShift(src, 1, 0).data,
		);
	});

	test("the input is never mutated", () => {
		const src = ramp(3, 3);
		const before = src.data.slice();
		wrapShift(src, 2, 1);
		expect(src.data).toEqual(before);
	});
});
