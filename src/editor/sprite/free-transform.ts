import { type PixelBuffer, blankPixels } from "./pixel-buffer";

/**
 * A 2×3 affine matrix in the canvas-2D convention:
 * `x' = a·x + c·y + e`, `y' = b·x + d·y + f`. The `a b c d` block is the linear
 * (scale/rotate/skew) part; `e f` is the translation.
 */
export type AffineMatrix = Readonly<{
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
}>;

/**
 * The decomposed parameters of a free transform, applied **about a pivot**.
 * Angles are radians, clockwise-positive in screen space (y-down);
 * `scaleX`/`scaleY` are multipliers; `skewX`/`skewY` shear one axis along the
 * other; `translateX`/`translateY` move the whole result in canvas cells.
 */
export type FreeTransformParams = Readonly<{
	scaleX: number;
	scaleY: number;
	rotate: number;
	skewX: number;
	skewY: number;
	translateX: number;
	translateY: number;
}>;

/** The no-op transform: unit scale, no rotation/skew/translation. */
export const IDENTITY_TRANSFORM: FreeTransformParams = {
	scaleX: 1,
	scaleY: 1,
	rotate: 0,
	skewX: 0,
	skewY: 0,
	translateX: 0,
	translateY: 0,
};

/** The identity affine matrix. */
export const IDENTITY_MATRIX: AffineMatrix = {
	a: 1,
	b: 0,
	c: 0,
	d: 1,
	e: 0,
	f: 0,
};

/** Compose two matrices so `compose(m2, m1)` applies `m1` first, then `m2`. */
export const compose = (
	m2: AffineMatrix,
	m1: AffineMatrix,
): AffineMatrix => ({
	a: m2.a * m1.a + m2.c * m1.b,
	b: m2.b * m1.a + m2.d * m1.b,
	c: m2.a * m1.c + m2.c * m1.d,
	d: m2.b * m1.c + m2.d * m1.d,
	e: m2.a * m1.e + m2.c * m1.f + m2.e,
	f: m2.b * m1.e + m2.d * m1.f + m2.f,
});

/** Map a point through a matrix. */
export const applyAffine = (
	m: AffineMatrix,
	x: number,
	y: number,
): { x: number; y: number } => ({
	x: m.a * x + m.c * y + m.e,
	y: m.b * x + m.d * y + m.f,
});

/**
 * The inverse of an affine matrix, or `null` when it is singular (a zero scale
 * collapses the shape and cannot be inverted). Inverse-sampling rasterisers use
 * this to walk output pixels back to their source.
 */
export const invertAffine = (
	m: AffineMatrix,
): AffineMatrix | null => {
	const det = m.a * m.d - m.b * m.c;
	if (Math.abs(det) < 1e-12) {
		return null;
	}
	const id = 1 / det;
	return {
		a: m.d * id,
		b: -m.b * id,
		c: -m.c * id,
		d: m.a * id,
		e: (m.c * m.f - m.d * m.e) * id,
		f: (m.b * m.e - m.a * m.f) * id,
	};
};

/**
 * Build the affine matrix for `params` applied about `(pivotX, pivotY)`:
 * translate the pivot to the origin, apply scale then skew then rotate, translate
 * back, and finally apply `translateX`/`translateY`. Composition order matches a
 * conventional transform gizmo — scaling and skew happen in the pre-rotation
 * frame, rotation orients the whole thing, translation is world-space.
 */
export const buildAffine = (
	params: FreeTransformParams,
	pivotX: number,
	pivotY: number,
): AffineMatrix => {
	const { scaleX, scaleY, rotate, skewX, skewY } = params;
	const cos = Math.cos(rotate);
	const sin = Math.sin(rotate);
	const scale: AffineMatrix = {
		a: scaleX,
		b: 0,
		c: 0,
		d: scaleY,
		e: 0,
		f: 0,
	};
	const skew: AffineMatrix = {
		a: 1,
		b: Math.tan(skewY),
		c: Math.tan(skewX),
		d: 1,
		e: 0,
		f: 0,
	};
	const rotation: AffineMatrix = {
		a: cos,
		b: sin,
		c: -sin,
		d: cos,
		e: 0,
		f: 0,
	};
	const linear = compose(rotation, compose(skew, scale));
	const toOrigin: AffineMatrix = {
		...IDENTITY_MATRIX,
		e: -pivotX,
		f: -pivotY,
	};
	const back: AffineMatrix = {
		...IDENTITY_MATRIX,
		e: pivotX + params.translateX,
		f: pivotY + params.translateY,
	};
	return compose(back, compose(linear, toOrigin));
};

/**
 * Inverse-sample `src` through `matrix` into a fresh `outW`×`outH` buffer:
 * every output pixel centre is mapped back through `matrix⁻¹` to a source
 * coordinate and the covering source pixel is copied (nearest — pixel-art, no
 * blending); samples outside `src` stay transparent. `matrix` maps
 * source-pixel-centre coordinates to output-pixel-centre coordinates, both with
 * origin at `(0, 0)`. Pure; returns an all-transparent buffer for a singular
 * matrix.
 *
 * This is the standalone, headlessly-testable core of the free transform; the
 * selection integration composes translated matrices around it to place a clip
 * into canvas space.
 */
export const rasterizeAffine = (
	src: PixelBuffer,
	matrix: AffineMatrix,
	outW: number,
	outH: number,
): PixelBuffer => {
	const out = blankPixels(outW, outH);
	const inv = invertAffine(matrix);
	if (!inv) {
		return out;
	}
	const { width: w, height: h, data } = src;
	const od = out.data;
	for (let oy = 0; oy < outH; oy++) {
		for (let ox = 0; ox < outW; ox++) {
			const p = applyAffine(inv, ox + 0.5, oy + 0.5);
			const sx = Math.floor(p.x);
			const sy = Math.floor(p.y);
			if (sx < 0 || sy < 0 || sx >= w || sy >= h) {
				continue;
			}
			const si = (sy * w + sx) * 4;
			const o = (oy * outW + ox) * 4;
			od[o] = data[si]!;
			od[o + 1] = data[si + 1]!;
			od[o + 2] = data[si + 2]!;
			od[o + 3] = data[si + 3]!;
		}
	}
	return out;
};
