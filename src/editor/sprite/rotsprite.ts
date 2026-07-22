import {
	flipHorizontal,
	flipVertical,
	rotateCcw,
	rotateCw,
} from "./image-transform";
import { type PixelBuffer, blankPixels } from "./pixel-buffer";

/**
 * Arbitrary-angle rotation of a {@link PixelBuffer} using the **RotSprite**
 * technique, which keeps rotated pixel art clean instead of the jagged, noisy
 * output a naive nearest-neighbour rotation produces.
 *
 * The approach (a faithful, documented approximation of Xenowhirl's RotSprite,
 * https://en.wikipedia.org/wiki/Pixel-art_scaling_algorithms#RotSprite):
 *
 * 1. **Upscale ×8** with three {@link scale2x} (EPX/Scale2x) passes. Scale2x
 *    only ever *copies* existing pixels — it never blends — so the palette is
 *    preserved and diagonal edges gain clean intermediate steps.
 * 2. **Rotate at the high resolution** by inverse-sampling the upscaled image
 *    (nearest) for every output subpixel.
 * 3. **Downscale ×8 by majority vote**: each output pixel is the most common
 *    colour among its 8×8 block of rotated subpixels. Majority (rather than
 *    averaging) again keeps colours on the palette while snapping stray
 *    subpixels to the dominant neighbour — the jaggie reduction RotSprite is
 *    known for.
 *
 * The **cardinal angles** (0°, 90°, 180°, 270°) short-circuit to the exact
 * integer transforms ({@link rotateCw} etc.) so they are pixel-perfect and
 * identical to the editor's existing 90° rotations — the general path is only
 * taken for genuinely off-axis angles.
 *
 * Angle sign: **clockwise-positive** in screen space (y-down), matching the
 * "rotate 90° clockwise" command, so `rotsprite(buf, Math.PI / 2)` equals
 * {@link rotateCw}. Pure: the input is never mutated.
 */
export const rotsprite = (
	src: PixelBuffer,
	angleRadians: number,
): PixelBuffer => {
	const a = normalizeAngle(angleRadians);
	if (a < EPS || TAU - a < EPS) {
		return clone(src);
	}
	if (Math.abs(a - Math.PI / 2) < EPS) {
		return rotateCw(src);
	}
	if (Math.abs(a - Math.PI) < EPS) {
		return flipHorizontal(flipVertical(src));
	}
	if (Math.abs(a - (3 * Math.PI) / 2) < EPS) {
		return rotateCcw(src);
	}
	return rotateGeneral(src, a);
};

/** The dimensions the bounding box of `src` rotated by `angleRadians` occupies. */
export const rotatedBounds = (
	width: number,
	height: number,
	angleRadians: number,
): { width: number; height: number } => {
	const a = normalizeAngle(angleRadians);
	if (a < EPS || TAU - a < EPS || Math.abs(a - Math.PI) < EPS) {
		return { width, height };
	}
	if (
		Math.abs(a - Math.PI / 2) < EPS ||
		Math.abs(a - (3 * Math.PI) / 2) < EPS
	) {
		return { width: height, height: width };
	}
	const cos = Math.abs(Math.cos(a));
	const sin = Math.abs(Math.sin(a));
	return {
		width: Math.max(1, Math.ceil(width * cos + height * sin)),
		height: Math.max(1, Math.ceil(width * sin + height * cos)),
	};
};

const TAU = Math.PI * 2;
const EPS = 1e-6;

/** The RotSprite upscale factor: three Scale2x passes = 8×. */
const UPSCALE = 8;

const normalizeAngle = (a: number): number => ((a % TAU) + TAU) % TAU;

const clone = (buf: PixelBuffer): PixelBuffer => ({
	width: buf.width,
	height: buf.height,
	data: new Uint8ClampedArray(buf.data),
});

/**
 * One EPX/Scale2x pass: doubles each dimension, expanding every source pixel
 * into a 2×2 block whose corners copy an orthogonal neighbour only when that
 * neighbour is flanked on both sides (the classic Scale2x rule), else the pixel
 * itself. Never blends, so no colours outside the source palette are created.
 */
const scale2x = (src: PixelBuffer): PixelBuffer => {
	const { width: w, height: h, data } = src;
	const out = blankPixels(w * 2, h * 2);
	const od = out.data;
	const idx = (x: number, y: number): number => {
		const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
		const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
		return (cy * w + cx) * 4;
	};
	const eq = (i: number, j: number): boolean =>
		data[i] === data[j] &&
		data[i + 1] === data[j + 1] &&
		data[i + 2] === data[j + 2] &&
		data[i + 3] === data[j + 3];
	const put = (dx: number, dy: number, si: number): void => {
		const o = (dy * w * 2 + dx) * 4;
		od[o] = data[si]!;
		od[o + 1] = data[si + 1]!;
		od[o + 2] = data[si + 2]!;
		od[o + 3] = data[si + 3]!;
	};
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const e = idx(x, y);
			const b = idx(x, y - 1);
			const d = idx(x - 1, y);
			const f = idx(x + 1, y);
			const hh = idx(x, y + 1);
			let e0 = e;
			let e1 = e;
			let e2 = e;
			let e3 = e;
			if (!eq(b, hh) && !eq(d, f)) {
				e0 = eq(d, b) ? d : e;
				e1 = eq(b, f) ? f : e;
				e2 = eq(d, hh) ? d : e;
				e3 = eq(hh, f) ? f : e;
			}
			put(2 * x, 2 * y, e0);
			put(2 * x + 1, 2 * y, e1);
			put(2 * x, 2 * y + 1, e2);
			put(2 * x + 1, 2 * y + 1, e3);
		}
	}
	return out;
};

const rotateGeneral = (
	src: PixelBuffer,
	theta: number,
): PixelBuffer => {
	const up = scale2x(scale2x(scale2x(src)));
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	const { width, height } = rotatedBounds(
		src.width,
		src.height,
		theta,
	);
	const out = blankPixels(width, height);
	const k = UPSCALE;
	const uw = up.width;
	const uh = up.height;
	const ud = up.data;
	// Centres of the upscaled output block and the upscaled source, so the
	// rotation pivots about the image centre.
	const ocx = (width * k) / 2;
	const ocy = (height * k) / 2;
	const scx = uw / 2;
	const scy = uh / 2;
	// Inverse rotation (output → source) is by −θ: [cos, sin; −sin, cos].
	const counts = new Map<number, number>();
	for (let oy = 0; oy < height; oy++) {
		for (let ox = 0; ox < width; ox++) {
			counts.clear();
			let bestKey = 0;
			let bestCount = 0;
			for (let sy = 0; sy < k; sy++) {
				for (let sx = 0; sx < k; sx++) {
					const dx = ox * k + sx + 0.5 - ocx;
					const dy = oy * k + sy + 0.5 - ocy;
					const su = cos * dx + sin * dy + scx;
					const sv = -sin * dx + cos * dy + scy;
					const ix = Math.floor(su);
					const iy = Math.floor(sv);
					let key = 0;
					if (ix >= 0 && iy >= 0 && ix < uw && iy < uh) {
						const i = (iy * uw + ix) * 4;
						key =
							((ud[i]! << 24) |
								(ud[i + 1]! << 16) |
								(ud[i + 2]! << 8) |
								ud[i + 3]!) >>>
							0;
					}
					const c = (counts.get(key) ?? 0) + 1;
					counts.set(key, c);
					if (c > bestCount) {
						bestCount = c;
						bestKey = key;
					}
				}
			}
			if (bestKey !== 0) {
				const o = (oy * width + ox) * 4;
				out.data[o] = (bestKey >>> 24) & 255;
				out.data[o + 1] = (bestKey >>> 16) & 255;
				out.data[o + 2] = (bestKey >>> 8) & 255;
				out.data[o + 3] = bestKey & 255;
			}
		}
	}
	return out;
};
