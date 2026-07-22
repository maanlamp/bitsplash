import { describe, expect, test } from "bun:test";
import type { PixelBuffer } from "../src/editor/sprite/pixel-buffer";
import { resizeNearest } from "../src/editor/sprite/resize-nearest";

/**
 * Unit tests for the pure nearest-neighbor resampler used by the actor migration
 * to downscale 128×128 authored frames to the game's 55×55 render size.
 */

const buffer = (
	width: number,
	height: number,
	fill: (
		x: number,
		y: number,
	) => readonly [number, number, number, number],
): PixelBuffer => {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const [r, g, b, a] = fill(x, y);
			const i = (y * width + x) * 4;
			data[i] = r;
			data[i + 1] = g;
			data[i + 2] = b;
			data[i + 3] = a;
		}
	}
	return { width, height, data };
};

const px = (
	image: PixelBuffer,
	x: number,
	y: number,
): readonly [number, number, number, number] => {
	const i = (y * image.width + x) * 4;
	return [
		image.data[i]!,
		image.data[i + 1]!,
		image.data[i + 2]!,
		image.data[i + 3]!,
	];
};

describe("resizeNearest", () => {
	test("identity when target equals source", () => {
		const src = buffer(4, 3, (x, y) => [x * 10, y * 10, 0, 255]);
		const out = resizeNearest(src, 4, 3);
		expect(out.width).toBe(4);
		expect(out.height).toBe(3);
		expect([...out.data]).toEqual([...src.data]);
	});

	test("integer 2× upscale duplicates each source pixel into a 2×2 block", () => {
		const src = buffer(2, 2, (x, y) => [x, y, x + y, 255]);
		const out = resizeNearest(src, 4, 4);
		expect(out.width).toBe(4);
		expect(out.height).toBe(4);
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				expect(px(out, x, y)).toEqual(px(src, x >> 1, y >> 1));
			}
		}
	});

	test("integer 2× downscale keeps the top-left of each block (floor mapping)", () => {
		const src = buffer(4, 4, (x, y) => [x * 20, y * 20, 0, 255]);
		const out = resizeNearest(src, 2, 2);
		expect(px(out, 0, 0)).toEqual(px(src, 0, 0));
		expect(px(out, 1, 0)).toEqual(px(src, 2, 0));
		expect(px(out, 0, 1)).toEqual(px(src, 0, 2));
		expect(px(out, 1, 1)).toEqual(px(src, 2, 2));
	});

	test("non-integer downscale maps via floor(x * srcW / targetW)", () => {
		const src = buffer(3, 1, (x) => [x, 0, 0, 255]);
		const out = resizeNearest(src, 2, 1);
		expect(px(out, 0, 0)).toEqual(px(src, 0, 0));
		expect(px(out, 1, 0)).toEqual(px(src, 1, 0));
	});

	test("non-integer upscale repeats source columns by floor mapping", () => {
		const src = buffer(2, 1, (x) => [x * 100, 0, 0, 255]);
		const out = resizeNearest(src, 3, 1);
		expect(px(out, 0, 0)).toEqual(px(src, 0, 0));
		expect(px(out, 1, 0)).toEqual(px(src, 0, 0));
		expect(px(out, 2, 0)).toEqual(px(src, 1, 0));
	});

	test("preserves alpha channel and hard edges (no averaging)", () => {
		const src = buffer(2, 1, (x) => [255, 0, 0, x === 0 ? 0 : 255]);
		const out = resizeNearest(src, 4, 1);
		expect(px(out, 0, 0)[3]).toBe(0);
		expect(px(out, 1, 0)[3]).toBe(0);
		expect(px(out, 2, 0)[3]).toBe(255);
		expect(px(out, 3, 0)[3]).toBe(255);
	});
});
