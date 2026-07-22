import { describe, expect, test } from "bun:test";
import {
	type AffineMatrix,
	IDENTITY_MATRIX,
	IDENTITY_TRANSFORM,
	applyAffine,
	buildAffine,
	invertAffine,
	rasterizeAffine,
} from "../src/editor/sprite/free-transform";
import {
	flipHorizontal,
	flipVertical,
} from "../src/editor/sprite/image-transform";
import { blankPixels } from "../src/editor/sprite/pixel-buffer";

const solid = (w: number, h: number) => {
	const buf = blankPixels(w, h);
	for (let i = 0; i < w * h; i++) {
		buf.data[i * 4] = 180;
		buf.data[i * 4 + 3] = 255;
	}
	return buf;
};

/** A buffer whose cells each carry a unique colour, for exact mapping checks. */
const ramp = (w: number, h: number) => {
	const buf = blankPixels(w, h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			buf.data[i] = x + 1;
			buf.data[i + 1] = y + 1;
			buf.data[i + 2] = 50;
			buf.data[i + 3] = 255;
		}
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

const closeMatrix = (m: AffineMatrix, n: AffineMatrix): void => {
	for (const k of ["a", "b", "c", "d", "e", "f"] as const) {
		expect(m[k]).toBeCloseTo(n[k], 6);
	}
};

describe("affine matrix algebra", () => {
	test("identity params build the identity matrix", () => {
		closeMatrix(
			buildAffine(IDENTITY_TRANSFORM, 8, 8),
			IDENTITY_MATRIX,
		);
	});

	test("invert ∘ build is the identity around any pivot", () => {
		const m = buildAffine(
			{
				scaleX: 1.7,
				scaleY: 0.6,
				rotate: 0.4,
				skewX: 0.2,
				skewY: -0.1,
				translateX: 3,
				translateY: -2,
			},
			10,
			6,
		);
		const inv = invertAffine(m);
		expect(inv).not.toBeNull();
		const round = applyAffine(
			m,
			applyAffine(inv!, 5, 7).x,
			applyAffine(inv!, 5, 7).y,
		);
		expect(round.x).toBeCloseTo(5, 6);
		expect(round.y).toBeCloseTo(7, 6);
	});

	test("a singular (zero-scale) matrix has no inverse", () => {
		const m = buildAffine({ ...IDENTITY_TRANSFORM, scaleX: 0 }, 0, 0);
		expect(invertAffine(m)).toBeNull();
	});

	test("pure scale about a pivot keeps the pivot fixed", () => {
		const m = buildAffine(
			{ ...IDENTITY_TRANSFORM, scaleX: 3, scaleY: 3 },
			4,
			4,
		);
		const p = applyAffine(m, 4, 4);
		expect(p.x).toBeCloseTo(4, 6);
		expect(p.y).toBeCloseTo(4, 6);
		const q = applyAffine(m, 5, 4);
		expect(q.x).toBeCloseTo(7, 6); // 4 + (5−4)·3
	});
});

describe("rasterizeAffine (inverse-sampled, nearest)", () => {
	test("identity matrix reproduces the source exactly", () => {
		const src = ramp(4, 3);
		const out = rasterizeAffine(src, IDENTITY_MATRIX, 4, 3);
		expect(Array.from(out.data)).toEqual(Array.from(src.data));
	});

	test("a singular matrix yields an all-transparent buffer", () => {
		const src = solid(4, 4);
		const out = rasterizeAffine(
			src,
			{ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 },
			4,
			4,
		);
		expect(opaqueCount(out)).toBe(0);
	});

	test("pure scale 2× doubles the covered area with no interior holes", () => {
		const src = solid(8, 8);
		const scale: AffineMatrix = {
			a: 2,
			b: 0,
			c: 0,
			d: 2,
			e: 0,
			f: 0,
		};
		const out = rasterizeAffine(src, scale, 16, 16);
		// Every output pixel maps back inside the source → fully covered.
		expect(opaqueCount(out)).toBe(16 * 16);
		expect(opaqueCount(out)).toBe(opaqueCount(src) * 4);
	});

	test("180° about the centre equals flip-both (exact under nearest)", () => {
		const src = ramp(5, 4);
		// Rotate π about (2.5, 2) → a=d=−1, maps (x,y)→(5−x, 4−y).
		const m: AffineMatrix = {
			a: -1,
			b: 0,
			c: 0,
			d: -1,
			e: 5,
			f: 4,
		};
		const out = rasterizeAffine(src, m, 5, 4);
		const exact = flipHorizontal(flipVertical(src));
		expect(Array.from(out.data)).toEqual(Array.from(exact.data));
	});

	test("an upscale (2.5×) leaves no transparent holes inside the image", () => {
		const src = solid(10, 10);
		const m: AffineMatrix = {
			a: 2.5,
			b: 0,
			c: 0,
			d: 2.5,
			e: 0,
			f: 0,
		};
		const out = rasterizeAffine(src, m, 25, 25);
		expect(opaqueCount(out)).toBe(25 * 25);
	});
});
