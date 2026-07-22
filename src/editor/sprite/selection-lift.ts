import {
	type AffineMatrix,
	applyAffine,
	invertAffine,
} from "./free-transform";
import {
	flipHorizontal,
	flipVertical,
	rotateCcw,
	rotateCw,
} from "./image-transform";
import { type PixelBuffer, blankPixels } from "./pixel-buffer";
import { rotsprite } from "./rotsprite";
import {
	type SelectionMask,
	flipMaskHorizontal,
	flipMaskVertical,
	maskBounds,
	rotateMaskCcw,
	rotateMaskCw,
	rotateMaskNearest,
} from "./selection-mask";

/**
 * The two halves of lifting a masked region off a cel: the selected pixels
 * pulled out onto their own transparent buffer, and the cel with those pixels
 * removed (the hole left behind). Both are canvas-sized and aligned to the cel,
 * so a floating selection is just `lifted` drawn back over `residue` at an
 * offset — and at zero offset that reproduces the original cel exactly.
 */
export type Lift = Readonly<{
	lifted: PixelBuffer;
	residue: PixelBuffer;
}>;

/**
 * Split a cel into its selected pixels ({@link Lift.lifted}) and the remainder
 * with the selection cleared to transparency ({@link Lift.residue}). Pure: the
 * inputs are not mutated. `cel` and `mask` must share dimensions.
 */
export const liftSelection = (
	cel: PixelBuffer,
	mask: SelectionMask,
): Lift => {
	const { width, height } = cel;
	const lifted = blankPixels(width, height);
	const residue = {
		width,
		height,
		data: new Uint8ClampedArray(cel.data),
	};
	for (let i = 0; i < width * height; i++) {
		if (mask.data[i] !== 1) {
			continue;
		}
		const o = i * 4;
		lifted.data[o] = cel.data[o]!;
		lifted.data[o + 1] = cel.data[o + 1]!;
		lifted.data[o + 2] = cel.data[o + 2]!;
		lifted.data[o + 3] = cel.data[o + 3]!;
		residue.data[o] = 0;
		residue.data[o + 1] = 0;
		residue.data[o + 2] = 0;
		residue.data[o + 3] = 0;
	}
	return { lifted, residue };
};

/**
 * Composite `lifted` over `base` shifted by `(dx, dy)`, returning a fresh cel.
 * Straight-alpha source-over per pixel, so a semi-transparent floated pixel
 * blends correctly onto whatever it lands on. Pure: neither input is mutated.
 *
 * `stampFloating(base, lifted, 0, 0)` where `{ lifted, residue: base }` came
 * from {@link liftSelection} reproduces the original cel — the lift/stamp
 * round-trip identity.
 */
export const stampFloating = (
	base: PixelBuffer,
	lifted: PixelBuffer,
	dx: number,
	dy: number,
): PixelBuffer => {
	const { width, height } = base;
	const out = {
		width,
		height,
		data: new Uint8ClampedArray(base.data),
	};
	for (let y = 0; y < height; y++) {
		const sy = y - dy;
		if (sy < 0 || sy >= height) {
			continue;
		}
		for (let x = 0; x < width; x++) {
			const sx = x - dx;
			if (sx < 0 || sx >= width) {
				continue;
			}
			const si = (sy * width + sx) * 4;
			const sa = lifted.data[si + 3]!;
			if (sa === 0) {
				continue;
			}
			const di = (y * width + x) * 4;
			overPixel(out.data, di, lifted.data, si, sa);
		}
	}
	return out;
};

const overPixel = (
	dst: Uint8ClampedArray,
	di: number,
	src: Uint8ClampedArray,
	si: number,
	sa: number,
): void => {
	const srcA = sa / 255;
	const dstA = dst[di + 3]! / 255;
	const outA = srcA + dstA * (1 - srcA);
	if (outA <= 0) {
		dst[di] = 0;
		dst[di + 1] = 0;
		dst[di + 2] = 0;
		dst[di + 3] = 0;
		return;
	}
	for (let c = 0; c < 3; c++) {
		const s = src[si + c]!;
		const d = dst[di + c]!;
		dst[di + c] = (s * srcA + d * dstA * (1 - srcA)) / outA;
	}
	dst[di + 3] = outA * 255;
};

/**
 * A rectangular clip: pixels and their matching mask cropped to the selection's
 * bounding box, plus the box origin. The internal clipboard holds one of these,
 * so a paste can re-place the exact pixels (and their non-rectangular shape) at
 * their original location or anywhere else.
 */
export type SelectionClip = Readonly<{
	pixels: PixelBuffer;
	mask: SelectionMask;
	originX: number;
	originY: number;
	width: number;
	height: number;
}>;

/**
 * Crop the lifted pixels and their mask to the selection's bounding box for the
 * clipboard. Returns `null` when the selection is empty.
 */
export const cropClip = (
	lifted: PixelBuffer,
	mask: SelectionMask,
): SelectionClip | null => {
	const bounds = maskBounds(mask);
	if (!bounds) {
		return null;
	}
	const { x0, y0, x1, y1 } = bounds;
	const w = x1 - x0 + 1;
	const h = y1 - y0 + 1;
	const pixels = blankPixels(w, h);
	const cropMask = {
		width: w,
		height: h,
		data: new Uint8Array(w * h),
	};
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const src = ((y0 + y) * lifted.width + (x0 + x)) * 4;
			const dst = (y * w + x) * 4;
			pixels.data[dst] = lifted.data[src]!;
			pixels.data[dst + 1] = lifted.data[src + 1]!;
			pixels.data[dst + 2] = lifted.data[src + 2]!;
			pixels.data[dst + 3] = lifted.data[src + 3]!;
			cropMask.data[y * w + x] =
				mask.data[(y0 + y) * mask.width + (x0 + x)]!;
		}
	}
	return {
		pixels,
		mask: cropMask,
		originX: x0,
		originY: y0,
		width: w,
		height: h,
	};
};

/** The four orthogonal transforms a floating selection can undergo in place. */
export type ClipTransform =
	| "flip-h"
	| "flip-v"
	| "rotate-cw"
	| "rotate-ccw";

/**
 * Flip or rotate-90 a {@link SelectionClip}, transforming its pixels and its
 * matching mask together and **re-centring** the result on the clip's bounds
 * centre — so a rotate of a non-square clip (which swaps `width`↔`height`) stays
 * visually anchored rather than pivoting about its top-left corner. Pure: the
 * input clip is not mutated. Flips leave the origin unchanged (their dimensions
 * are unchanged); `rotate-cw` and `rotate-ccw` are exact inverses of each other.
 */
export const transformClip = (
	clip: SelectionClip,
	transform: ClipTransform,
): SelectionClip => {
	const pixels =
		transform === "flip-h"
			? flipHorizontal(clip.pixels)
			: transform === "flip-v"
				? flipVertical(clip.pixels)
				: transform === "rotate-cw"
					? rotateCw(clip.pixels)
					: rotateCcw(clip.pixels);
	const mask =
		transform === "flip-h"
			? flipMaskHorizontal(clip.mask)
			: transform === "flip-v"
				? flipMaskVertical(clip.mask)
				: transform === "rotate-cw"
					? rotateMaskCw(clip.mask)
					: rotateMaskCcw(clip.mask);
	const cx = clip.originX + clip.width / 2;
	const cy = clip.originY + clip.height / 2;
	return {
		pixels,
		mask,
		originX: Math.round(cx - pixels.width / 2),
		originY: Math.round(cy - pixels.height / 2),
		width: pixels.width,
		height: pixels.height,
	};
};

/**
 * Rotate a {@link SelectionClip} by an **arbitrary** angle (radians,
 * clockwise-positive) using RotSprite for the pixels
 * ({@link import("./rotsprite").rotsprite}) and a nearest rotation for the mask,
 * re-centring the result on the clip's bounds centre — the arbitrary-angle
 * analogue of {@link transformClip}'s 90° rotations, so a rotated float stays
 * visually anchored rather than pivoting about its corner. Pure: the input clip
 * is not mutated. At the cardinal angles this reduces to the exact integer
 * rotations.
 */
export const rotateClip = (
	clip: SelectionClip,
	angleRadians: number,
): SelectionClip => {
	const pixels = rotsprite(clip.pixels, angleRadians);
	const mask = rotateMaskNearest(
		clip.mask,
		angleRadians,
		pixels.width,
		pixels.height,
	);
	const cx = clip.originX + clip.width / 2;
	const cy = clip.originY + clip.height / 2;
	return {
		pixels,
		mask,
		originX: Math.round(cx - pixels.width / 2),
		originY: Math.round(cy - pixels.height / 2),
		width: pixels.width,
		height: pixels.height,
	};
};

/**
 * Rasterise a {@link SelectionClip} through an affine `matrix` (canvas → canvas)
 * into a canvas-sized `lifted` buffer and matching mask, by inverse-sampling
 * every covered canvas cell back to the clip's local pixels (nearest —
 * pixel-art). Only the transformed bounding box is walked, so a live
 * free-transform drag stays proportional to the float's size rather than the
 * whole canvas. With the identity matrix the clip is reproduced in place, so
 * this is a superset of {@link placeClip} for the transform path.
 */
export const rasterizeClip = (
	clip: SelectionClip,
	matrix: AffineMatrix,
	canvasWidth: number,
	canvasHeight: number,
): { lifted: PixelBuffer; mask: SelectionMask } => {
	const lifted = blankPixels(canvasWidth, canvasHeight);
	const mask = {
		width: canvasWidth,
		height: canvasHeight,
		data: new Uint8Array(canvasWidth * canvasHeight),
	};
	const inv = invertAffine(matrix);
	if (!inv) {
		return { lifted, mask };
	}
	const corners = [
		[clip.originX, clip.originY],
		[clip.originX + clip.width, clip.originY],
		[clip.originX + clip.width, clip.originY + clip.height],
		[clip.originX, clip.originY + clip.height],
	].map(([x, y]) => applyAffine(matrix, x!, y!));
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const c of corners) {
		minX = Math.min(minX, c.x);
		minY = Math.min(minY, c.y);
		maxX = Math.max(maxX, c.x);
		maxY = Math.max(maxY, c.y);
	}
	const x0 = Math.max(0, Math.floor(minX));
	const y0 = Math.max(0, Math.floor(minY));
	const x1 = Math.min(canvasWidth - 1, Math.ceil(maxX));
	const y1 = Math.min(canvasHeight - 1, Math.ceil(maxY));
	for (let cy = y0; cy <= y1; cy++) {
		for (let cx = x0; cx <= x1; cx++) {
			const p = applyAffine(inv, cx + 0.5, cy + 0.5);
			const lx = Math.floor(p.x - clip.originX);
			const ly = Math.floor(p.y - clip.originY);
			if (
				lx < 0 ||
				ly < 0 ||
				lx >= clip.width ||
				ly >= clip.height ||
				clip.mask.data[ly * clip.width + lx] !== 1
			) {
				continue;
			}
			const si = (ly * clip.width + lx) * 4;
			const di = (cy * canvasWidth + cx) * 4;
			lifted.data[di] = clip.pixels.data[si]!;
			lifted.data[di + 1] = clip.pixels.data[si + 1]!;
			lifted.data[di + 2] = clip.pixels.data[si + 2]!;
			lifted.data[di + 3] = clip.pixels.data[si + 3]!;
			mask.data[cy * canvasWidth + cx] = 1;
		}
	}
	return { lifted, mask };
};

/**
 * Expand a clip back into a canvas-sized `lifted` buffer and matching mask with
 * its top-left placed at `(atX, atY)`, clipped to the canvas. The paste path
 * uses this to turn the clipboard into a floating selection.
 */
export const placeClip = (
	canvasWidth: number,
	canvasHeight: number,
	clip: SelectionClip,
	atX: number,
	atY: number,
): { lifted: PixelBuffer; mask: SelectionMask } => {
	const lifted = blankPixels(canvasWidth, canvasHeight);
	const mask = {
		width: canvasWidth,
		height: canvasHeight,
		data: new Uint8Array(canvasWidth * canvasHeight),
	};
	for (let y = 0; y < clip.height; y++) {
		const dy = atY + y;
		if (dy < 0 || dy >= canvasHeight) {
			continue;
		}
		for (let x = 0; x < clip.width; x++) {
			const dx = atX + x;
			if (dx < 0 || dx >= canvasWidth) {
				continue;
			}
			if (clip.mask.data[y * clip.width + x] !== 1) {
				continue;
			}
			const src = (y * clip.width + x) * 4;
			const dst = (dy * canvasWidth + dx) * 4;
			lifted.data[dst] = clip.pixels.data[src]!;
			lifted.data[dst + 1] = clip.pixels.data[src + 1]!;
			lifted.data[dst + 2] = clip.pixels.data[src + 2]!;
			lifted.data[dst + 3] = clip.pixels.data[src + 3]!;
			mask.data[dy * canvasWidth + dx] = 1;
		}
	}
	return { lifted, mask };
};
