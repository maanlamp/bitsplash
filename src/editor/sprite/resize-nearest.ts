import { type PixelBuffer, blankPixels } from "./pixel-buffer";

/**
 * Resample a {@link PixelBuffer} to `targetW`×`targetH` using **nearest-neighbor**
 * sampling: each target pixel copies the source pixel at
 * `floor(x * srcW / targetW), floor(y * srcH / targetH)`. No averaging or
 * interpolation, so hard pixel-art edges and the source's aliasing are preserved
 * exactly — the same look Aseprite's "nearest" export produces. Returns a fresh
 * buffer; when the target size equals the source size the result is a pixel-exact
 * copy.
 *
 * Pure and DOM-free, so it runs headlessly in the actor migration and tests.
 *
 * @example
 * const half = resizeNearest(src128, 64, 64); // downscale 2:1
 */
export const resizeNearest = (
	src: PixelBuffer,
	targetW: number,
	targetH: number,
): PixelBuffer => {
	const out = blankPixels(targetW, targetH);
	const { width: srcW, height: srcH, data: sd } = src;
	const od = out.data;
	for (let ty = 0; ty < targetH; ty++) {
		const sy = Math.floor((ty * srcH) / targetH);
		for (let tx = 0; tx < targetW; tx++) {
			const sx = Math.floor((tx * srcW) / targetW);
			const si = (sy * srcW + sx) * 4;
			const di = (ty * targetW + tx) * 4;
			od[di] = sd[si]!;
			od[di + 1] = sd[si + 1]!;
			od[di + 2] = sd[si + 2]!;
			od[di + 3] = sd[si + 3]!;
		}
	}
	return out;
};
