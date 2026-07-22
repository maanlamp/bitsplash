import { describe, expect, test } from "bun:test";
import { decodePng, encodePng } from "../src/editor/sprite/png-codec";
import type { PixelBuffer } from "../src/editor/sprite/pixel-buffer";

const buffer = (
	width: number,
	height: number,
	fill: (x: number, y: number) => [number, number, number, number],
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

describe("png-codec", () => {
	test("round-trips arbitrary RGBA pixels", () => {
		const image = buffer(5, 3, (x, y) => [
			(x * 40) & 0xff,
			(y * 80) & 0xff,
			(x * y * 17) & 0xff,
			x === 0 ? 0 : 255,
		]);
		const decoded = decodePng(encodePng(image));
		expect(decoded.width).toBe(5);
		expect(decoded.height).toBe(3);
		expect([...decoded.data]).toEqual([...image.data]);
	});

	test("encoding is deterministic for identical pixels", () => {
		const image = buffer(4, 4, (x) => [x * 60, 10, 20, 255]);
		const a = encodePng(image);
		const b = encodePng(image);
		expect([...a]).toEqual([...b]);
	});

	test("preserves a fully-transparent buffer", () => {
		const image = buffer(2, 2, () => [0, 0, 0, 0]);
		const decoded = decodePng(encodePng(image));
		expect([...decoded.data]).toEqual([...image.data]);
	});

	test("rejects non-PNG bytes", () => {
		expect(() => decodePng(new Uint8Array([1, 2, 3, 4]))).toThrow();
	});
});
