import { type PixelBuffer, blankPixels } from "./pixel-buffer";

/** A straight-alpha RGBA colour, each channel `0..255`. */
export type Rgba = readonly [number, number, number, number];

const distance = (
	data: Uint8ClampedArray,
	i: number,
	[r, g, b, a]: Rgba,
): number =>
	Math.max(
		Math.abs(data[i]! - r),
		Math.abs(data[i + 1]! - g),
		Math.abs(data[i + 2]! - b),
		Math.abs(data[i + 3]! - a),
	);

/**
 * Replace every pixel matching colour `from` with colour `to`, returning a fresh
 * {@link PixelBuffer} (the input is never mutated). A pixel matches when its
 * Chebyshev (max-channel) RGBA distance from `from` is `<= tolerance`, so
 * tolerance `0` replaces only exact matches (alpha included) and higher
 * tolerances catch near colours — the same match rule the bucket fill uses.
 *
 * Alpha is part of both the match and the write: replacing an opaque colour
 * leaves transparent pixels untouched even when their RGB happens to coincide,
 * and `to`'s alpha is written verbatim (so A→transparent erases the region).
 *
 * @example
 * // Recolour every exact-red pixel to blue.
 * replaceColor(cel, [255, 0, 0, 255], [0, 0, 255, 255], 0);
 */
export const replaceColor = (
	pixels: PixelBuffer,
	from: Rgba,
	to: Rgba,
	tolerance = 0,
): PixelBuffer => {
	const { width, height, data } = pixels;
	const out = blankPixels(width, height);
	out.data.set(data);
	for (let i = 0; i < data.length; i += 4) {
		if (distance(data, i, from) <= tolerance) {
			out.data[i] = to[0];
			out.data[i + 1] = to[1];
			out.data[i + 2] = to[2];
			out.data[i + 3] = to[3];
		}
	}
	return out;
};
