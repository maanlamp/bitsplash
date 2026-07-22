import { type PixelBuffer, blankPixels } from "./pixel-buffer";

/**
 * Shift a {@link PixelBuffer} by `(dx, dy)` with **wraparound**: pixels pushed
 * off one edge re-enter the opposite edge, producing a fresh buffer of the same
 * dimensions (the input is never mutated). This is the classic tool for turning
 * a texture into a seamless tile — shift the seam into the middle, fix it, shift
 * back.
 *
 * The shift is exact and reversible: `wrapShift(wrapShift(b, dx, dy), -dx, -dy)`
 * reproduces `b`. Offsets are taken modulo the dimensions, so any integer
 * (including negative or larger-than-canvas) is valid.
 *
 * @example
 * const shifted = wrapShift(buffer, 1, 0); // every column moves one cell right,
 *                                          // the last column wraps to the first
 */
export const wrapShift = (
	buffer: PixelBuffer,
	dx: number,
	dy: number,
): PixelBuffer => {
	const { width, height, data } = buffer;
	const out = blankPixels(width, height);
	const od = out.data;
	const mx = ((dx % width) + width) % width;
	const my = ((dy % height) + height) % height;
	for (let y = 0; y < height; y++) {
		const ny = (y + my) % height;
		for (let x = 0; x < width; x++) {
			const nx = (x + mx) % width;
			const src = (y * width + x) * 4;
			const dst = (ny * width + nx) * 4;
			od[dst] = data[src]!;
			od[dst + 1] = data[src + 1]!;
			od[dst + 2] = data[src + 2]!;
			od[dst + 3] = data[src + 3]!;
		}
	}
	return out;
};
