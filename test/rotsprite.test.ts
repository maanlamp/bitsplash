import { describe, expect, test } from "bun:test";
import {
	flipHorizontal,
	flipVertical,
	rotateCcw,
	rotateCw,
} from "../src/editor/sprite/image-transform";
import { blankPixels } from "../src/editor/sprite/pixel-buffer";
import {
	rotatedBounds,
	rotsprite,
} from "../src/editor/sprite/rotsprite";

/** A W×H buffer whose every cell carries a distinct opaque colour. */
const ramp = (w: number, h: number) => {
	const buf = blankPixels(w, h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			buf.data[i] = (x * 37) % 256;
			buf.data[i + 1] = (y * 53) % 256;
			buf.data[i + 2] = ((x + y) * 17) % 256;
			buf.data[i + 3] = 255;
		}
	}
	return buf;
};

/** A solid opaque block, for coverage/round-trip assertions. */
const solid = (w: number, h: number, r = 200, g = 120, b = 40) => {
	const buf = blankPixels(w, h);
	for (let i = 0; i < w * h; i++) {
		buf.data[i * 4] = r;
		buf.data[i * 4 + 1] = g;
		buf.data[i * 4 + 2] = b;
		buf.data[i * 4 + 3] = 255;
	}
	return buf;
};

const opaqueCount = (buf: { data: Uint8ClampedArray }): number => {
	let n = 0;
	for (let i = 3; i < buf.data.length; i += 4) {
		if (buf.data[i]! > 0) {
			n++;
		}
	}
	return n;
};

const rad = (deg: number): number => (deg * Math.PI) / 180;

describe("rotsprite cardinal angles == exact integer rotations", () => {
	const src = ramp(5, 3);

	test("0° is an exact copy", () => {
		const out = rotsprite(src, 0);
		expect(out.width).toBe(5);
		expect(out.height).toBe(3);
		expect(Array.from(out.data)).toEqual(Array.from(src.data));
	});

	test("360° is an exact copy", () => {
		expect(Array.from(rotsprite(src, rad(360)).data)).toEqual(
			Array.from(src.data),
		);
	});

	test("90° matches rotateCw exactly", () => {
		const out = rotsprite(src, rad(90));
		const exact = rotateCw(src);
		expect(out.width).toBe(exact.width);
		expect(out.height).toBe(exact.height);
		expect(Array.from(out.data)).toEqual(Array.from(exact.data));
	});

	test("180° matches flip-both exactly", () => {
		const out = rotsprite(src, rad(180));
		const exact = flipHorizontal(flipVertical(src));
		expect(Array.from(out.data)).toEqual(Array.from(exact.data));
	});

	test("270° matches rotateCcw exactly", () => {
		const out = rotsprite(src, rad(270));
		const exact = rotateCcw(src);
		expect(Array.from(out.data)).toEqual(Array.from(exact.data));
	});

	test("negative angle normalises (−90° == 270°)", () => {
		expect(Array.from(rotsprite(src, rad(-90)).data)).toEqual(
			Array.from(rotateCcw(src).data),
		);
	});
});

describe("rotsprite general angle", () => {
	test("45° returns the bounding-box dimensions and is non-empty", () => {
		const src = solid(16, 16);
		const out = rotsprite(src, rad(45));
		const bounds = rotatedBounds(16, 16, rad(45));
		expect(out.width).toBe(bounds.width);
		expect(out.height).toBe(bounds.height);
		// 16×16 rotated 45° spans ceil(16·√2) ≈ 23 per side.
		expect(out.width).toBe(23);
		expect(out.height).toBe(23);
		expect(opaqueCount(out)).toBeGreaterThan(0);
	});

	test("45° output stays bounded (no runaway growth)", () => {
		const out = rotsprite(solid(20, 12), rad(45));
		expect(out.width).toBeLessThanOrEqual(20 + 12 + 2);
		expect(out.height).toBeLessThanOrEqual(20 + 12 + 2);
	});

	test("a rotated solid keeps roughly its original opaque area", () => {
		const src = solid(24, 24);
		const out = rotsprite(src, rad(30));
		const area = opaqueCount(out);
		// RotSprite is area-preserving within resampling error; allow ±20%.
		expect(area).toBeGreaterThan(24 * 24 * 0.8);
		expect(area).toBeLessThan(24 * 24 * 1.2);
	});

	test("round-trip +θ then −θ approximately preserves the content", () => {
		// Each rotation re-pads to its bounding box, so the round-trip buffer is
		// larger than the source; the *content* (not the canvas) is the invariant.
		const src = solid(24, 24);
		const rotated = rotsprite(src, rad(37));
		const back = rotsprite(rotated, rad(-37));
		// The centre region is still opaque (the block survived the round-trip).
		const cx = Math.floor(back.width / 2);
		const cy = Math.floor(back.height / 2);
		const ci = (cy * back.width + cx) * 4;
		expect(back.data[ci + 3]).toBe(255);
		// The opaque area recovers close to the original 24×24 block.
		const area = opaqueCount(back);
		expect(area).toBeGreaterThan(24 * 24 * 0.8);
		expect(area).toBeLessThan(24 * 24 * 1.25);
	});

	test("does not invent colours outside the source palette", () => {
		const src = solid(16, 16, 10, 20, 30);
		const out = rotsprite(src, rad(22));
		for (let i = 0; i < out.data.length; i += 4) {
			if (out.data[i + 3] === 0) {
				continue;
			}
			expect(out.data[i]).toBe(10);
			expect(out.data[i + 1]).toBe(20);
			expect(out.data[i + 2]).toBe(30);
		}
	});
});
