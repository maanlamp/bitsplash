import { ditherThreshold } from "./dither";
import type { Cell } from "./shapes";

/**
 * The cells of an image partitioned between the two endpoints of a dithered
 * linear gradient. `a` are the cells nearer the start colour, `b` the cells
 * nearer the end colour, decided per pixel by projecting it onto the gradient
 * axis and comparing the projected position against the ordered-dither
 * threshold — so the boundary between the colours is a dither pattern, not a
 * hard line.
 */
export type GradientPartition = Readonly<{
	a: ReadonlyArray<Cell>;
	b: ReadonlyArray<Cell>;
}>;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Rasterise a dithered linear gradient over a `width × height` image between
 * axis endpoints `(ax, ay)` → `(bx, by)`.
 *
 * Each cell's parameter `t` is its normalised projection onto the axis
 * (`0` at the start, `1` at the end, clamped). The cell belongs to endpoint `b`
 * when `t` exceeds that cell's Bayer threshold and to endpoint `a` otherwise, so
 * the fraction of `b` cells rises smoothly from `0` at the start to `1` at the
 * end. A zero-length axis puts every cell in `a`.
 *
 * The consumer paints `a` with the start colour and `b` with the end colour; for
 * a colour→transparent gradient (no secondary colour) it paints `a` only and
 * leaves `b` transparent.
 *
 * @example
 * // A 4-wide, 1-tall left→right gradient: more `a` at the left, more `b` at the right.
 * gradientDither(4, 1, 0, 0, 3, 0);
 */
export const gradientDither = (
	width: number,
	height: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): GradientPartition => {
	const dx = bx - ax;
	const dy = by - ay;
	const len2 = dx * dx + dy * dy;
	const a: Cell[] = [];
	const b: Cell[] = [];
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const t =
				len2 === 0
					? 0
					: clamp01(((x - ax) * dx + (y - ay) * dy) / len2);
			if (t > ditherThreshold(x, y)) {
				b.push([x, y]);
			} else {
				a.push([x, y]);
			}
		}
	}
	return { a, b };
};
