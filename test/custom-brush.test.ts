import { describe, expect, test } from "bun:test";
import {
	captureBrush,
	stampPatternOver,
} from "../src/editor/sprite/custom-brush";
import {
	type PixelBuffer,
	blankPixels,
} from "../src/editor/sprite/pixel-buffer";
import {
	createMask,
	rectMask,
} from "../src/editor/sprite/selection-mask";

const set = (
	buf: PixelBuffer,
	x: number,
	y: number,
	rgba: [number, number, number, number],
): void => {
	const i = (y * buf.width + x) * 4;
	buf.data[i] = rgba[0];
	buf.data[i + 1] = rgba[1];
	buf.data[i + 2] = rgba[2];
	buf.data[i + 3] = rgba[3];
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

describe("captureBrush", () => {
	test("crops the masked region of the cel to its bounds", () => {
		const cel = blankPixels(8, 8);
		set(cel, 3, 4, [10, 20, 30, 255]);
		set(cel, 4, 4, [40, 50, 60, 255]);
		const mask = rectMask(8, 8, 3, 4, 4, 4);
		const stamp = captureBrush(cel, mask)!;
		expect(stamp.width).toBe(2);
		expect(stamp.height).toBe(1);
		expect(at(stamp, 0, 0)).toEqual([10, 20, 30, 255]);
		expect(at(stamp, 1, 0)).toEqual([40, 50, 60, 255]);
	});

	test("cells outside the mask are left transparent in the stamp", () => {
		const cel = blankPixels(8, 8);
		set(cel, 2, 2, [10, 20, 30, 255]);
		set(cel, 4, 2, [40, 50, 60, 255]);
		// Diagonal-ish mask covering (2,2) and (4,2) but not (3,2) between them.
		const mask = createMask(8, 8);
		mask.data[2 * 8 + 2] = 1;
		mask.data[2 * 8 + 4] = 1;
		const stamp = captureBrush(cel, mask)!;
		expect(stamp.width).toBe(3);
		expect(at(stamp, 0, 0)).toEqual([10, 20, 30, 255]);
		expect(at(stamp, 1, 0)).toEqual([0, 0, 0, 0]); // masked out
		expect(at(stamp, 2, 0)).toEqual([40, 50, 60, 255]);
	});

	test("an empty selection yields null", () => {
		expect(
			captureBrush(blankPixels(4, 4), createMask(4, 4)),
		).toBeNull();
	});
});

describe("stampPatternOver", () => {
	test("centres a 1×1 opaque stamp on the cursor cell", () => {
		const base = blankPixels(8, 8);
		const pattern = blankPixels(1, 1);
		set(pattern, 0, 0, [90, 80, 70, 255]);
		const out = stampPatternOver(base, pattern, 5, 6);
		expect(at(out, 5, 6)).toEqual([90, 80, 70, 255]);
		expect(at(out, 4, 6)).toEqual([0, 0, 0, 0]);
	});

	test("centres a 3×3 stamp so its middle lands on the cursor", () => {
		const base = blankPixels(8, 8);
		const pattern = blankPixels(3, 3);
		set(pattern, 0, 0, [1, 1, 1, 255]); // pattern top-left
		set(pattern, 1, 1, [2, 2, 2, 255]); // pattern centre
		const out = stampPatternOver(base, pattern, 4, 4);
		// centre (1,1) → (4,4); top-left (0,0) → (3,3).
		expect(at(out, 4, 4)).toEqual([2, 2, 2, 255]);
		expect(at(out, 3, 3)).toEqual([1, 1, 1, 255]);
	});

	test("transparent stamp cells pass the base through untouched", () => {
		const base = blankPixels(4, 4);
		set(base, 1, 1, [200, 100, 50, 255]);
		const pattern = blankPixels(1, 1); // fully transparent
		const out = stampPatternOver(base, pattern, 1, 1);
		expect(at(out, 1, 1)).toEqual([200, 100, 50, 255]);
	});

	test("stamp cells outside the canvas are clipped", () => {
		const base = blankPixels(4, 4);
		const pattern = blankPixels(3, 3);
		for (let i = 0; i < pattern.data.length; i += 4) {
			pattern.data[i] = 255;
			pattern.data[i + 3] = 255;
		}
		// Centre at the corner: only the in-bounds 2×2 quadrant is written.
		const out = stampPatternOver(base, pattern, 0, 0);
		expect(at(out, 0, 0)).toEqual([255, 0, 0, 255]);
		expect(at(out, 1, 1)).toEqual([255, 0, 0, 255]);
		expect(at(out, 2, 2)).toEqual([0, 0, 0, 0]);
	});

	test("the inputs are never mutated", () => {
		const base = blankPixels(4, 4);
		const pattern = blankPixels(1, 1);
		set(pattern, 0, 0, [5, 6, 7, 255]);
		const baseBefore = base.data.slice();
		const patternBefore = pattern.data.slice();
		stampPatternOver(base, pattern, 2, 2);
		expect(base.data).toEqual(baseBefore);
		expect(pattern.data).toEqual(patternBefore);
	});
});
