import { describe, expect, test } from "bun:test";
import {
	alphaBounds,
	contentRectForFrames,
} from "../src/editor/sprite/content-rect";
import type { PixelBuffer } from "../src/editor/sprite/pixel-buffer";

const withOpaque = (
	width: number,
	height: number,
	opaque: ReadonlyArray<readonly [number, number]>,
): PixelBuffer => {
	const data = new Uint8ClampedArray(width * height * 4);
	for (const [x, y] of opaque) {
		data[(y * width + x) * 4 + 3] = 255;
	}
	return { width, height, data };
};

describe("alphaBounds", () => {
	test("tight box around non-transparent pixels", () => {
		const image = withOpaque(8, 8, [
			[2, 3],
			[5, 3],
			[3, 6],
		]);
		expect(alphaBounds(image)).toEqual({
			x: 2,
			y: 3,
			width: 4,
			height: 4,
		});
	});

	test("single pixel is a 1×1 box", () => {
		expect(alphaBounds(withOpaque(4, 4, [[1, 2]]))).toEqual({
			x: 1,
			y: 2,
			width: 1,
			height: 1,
		});
	});

	test("fully transparent returns null", () => {
		expect(alphaBounds(withOpaque(4, 4, []))).toBeNull();
	});
});

describe("contentRectForFrames", () => {
	test("unions the alpha boxes of every frame", () => {
		const a = withOpaque(10, 10, [[1, 1]]);
		const b = withOpaque(10, 10, [[7, 8]]);
		expect(contentRectForFrames([a, b])).toEqual({
			x: 1,
			y: 1,
			width: 7,
			height: 8,
		});
	});

	test("ignores fully-transparent frames", () => {
		const a = withOpaque(10, 10, []);
		const b = withOpaque(10, 10, [[3, 4]]);
		expect(contentRectForFrames([a, b])).toEqual({
			x: 3,
			y: 4,
			width: 1,
			height: 1,
		});
	});

	test("all-transparent tag returns null", () => {
		expect(
			contentRectForFrames([
				withOpaque(4, 4, []),
				withOpaque(4, 4, []),
			]),
		).toBeNull();
	});
});
