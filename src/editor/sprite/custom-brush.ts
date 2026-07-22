import type { PixelBuffer } from "./pixel-buffer";
import { cropClip, liftSelection } from "./selection-lift";
import type { SelectionMask } from "./selection-mask";

/**
 * Capture the pixels a selection covers on `cel` as a reusable brush stamp: the
 * masked region cropped to its bounding box, with unselected cells left
 * transparent. Returns `null` when the selection is empty. Pure — neither input
 * is mutated. The custom-brush tool stamps the returned buffer along a stroke.
 *
 * @example
 * const stamp = captureBrush(activeCel, marqueeMask);
 * if (stamp) state.setCustomBrush(stamp);
 */
export const captureBrush = (
	cel: PixelBuffer,
	mask: SelectionMask,
): PixelBuffer | null => {
	const { lifted } = liftSelection(cel, mask);
	const clip = cropClip(lifted, mask);
	return clip ? clip.pixels : null;
};

/**
 * Composite a `pattern` stamp over `base` with straight-alpha source-over,
 * **centred** on cell `(cx, cy)`, returning a fresh buffer (neither input is
 * mutated). The pattern's own per-pixel alpha is honoured, so a stamp with soft
 * or partial-transparency edges blends onto whatever it lands on; cells the
 * pattern leaves fully transparent pass the base through untouched. Pattern
 * pixels that fall outside the canvas are clipped.
 */
export const stampPatternOver = (
	base: PixelBuffer,
	pattern: PixelBuffer,
	cx: number,
	cy: number,
): PixelBuffer => {
	const { width, height } = base;
	const out: PixelBuffer = {
		width,
		height,
		data: new Uint8ClampedArray(base.data),
	};
	const ox = cx - (pattern.width >> 1);
	const oy = cy - (pattern.height >> 1);
	for (let py = 0; py < pattern.height; py++) {
		const y = oy + py;
		if (y < 0 || y >= height) {
			continue;
		}
		for (let px = 0; px < pattern.width; px++) {
			const x = ox + px;
			if (x < 0 || x >= width) {
				continue;
			}
			const si = (py * pattern.width + px) * 4;
			const sa = pattern.data[si + 3]!;
			if (sa === 0) {
				continue;
			}
			over(out.data, (y * width + x) * 4, pattern.data, si, sa);
		}
	}
	return out;
};

const over = (
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
