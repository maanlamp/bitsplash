/**
 * Ordered (Bayer) dithering: a fixed threshold matrix tiled across image space
 * so a per-pixel decision "is this cell on at density `d`?" produces the classic
 * cross-hatch pattern used for gradients and the dither brush. Because the
 * threshold depends only on `(x, y)` in document space, patterns from separate
 * strokes line up seamlessly.
 */

/**
 * The 4×4 Bayer matrix (values `0..15`). The standard recursively-generated
 * ordered-dither matrix; index by `[y & 3][x & 3]`.
 */
export const BAYER_4X4: ReadonlyArray<ReadonlyArray<number>> = [
	[0, 8, 2, 10],
	[12, 4, 14, 6],
	[3, 11, 1, 9],
	[15, 7, 13, 5],
];

const BAYER_SIZE = 4;
const BAYER_LEVELS = BAYER_SIZE * BAYER_SIZE;

/**
 * The dither threshold for document cell `(x, y)`, in the open interval
 * `(0, 1)`. A cell is "on" at density `d` exactly when `d > threshold(x, y)`, so
 * density `0` yields nothing and density `1` yields every cell.
 *
 * @example
 * ditherThreshold(0, 0); // 0.03125  (matrix 0  → (0 + 0.5)/16)
 * ditherThreshold(3, 3); // 0.34375  (matrix 5  → (5 + 0.5)/16)
 */
export const ditherThreshold = (x: number, y: number): number => {
	const row =
		BAYER_4X4[((y % BAYER_SIZE) + BAYER_SIZE) % BAYER_SIZE]!;
	const value = row[((x % BAYER_SIZE) + BAYER_SIZE) % BAYER_SIZE]!;
	return (value + 0.5) / BAYER_LEVELS;
};

/**
 * Whether document cell `(x, y)` is painted at the given `density` (0–1) under
 * ordered dithering. `density <= 0` is always off; `density >= 1` is always on.
 *
 * @example
 * ditherMask(0, 0, 0);   // false (nothing at 0%)
 * ditherMask(0, 0, 1);   // true  (everything at 100%)
 * ditherMask(0, 0, 0.5); // true  (0,0 has the lowest threshold)
 */
export const ditherMask = (
	x: number,
	y: number,
	density: number,
): boolean => density > ditherThreshold(x, y);
