import { type PixelBuffer, blankPixels } from "./pixel-buffer";

/**
 * Whether a committed stroke buffer paints its coverage onto the layer or
 * clears it. A brush stroke is `paint` (source-over); an eraser stroke is
 * `erase` (destination-out).
 */
export type StrokeMode = "paint" | "erase";

/**
 * Mark cell `(x, y)` as covered by the in-progress stroke, storing the stroke
 * colour at **full** opacity (alpha `255`) regardless of the brush's target
 * opacity.
 *
 * Stamping is idempotent per cell: re-stamping a cell the stroke already
 * touched (a self-overlap on a fast scribble) leaves it at full opacity rather
 * than accumulating alpha. That is what makes a semi-transparent stroke land as
 * one uniform coat — the target opacity is applied exactly once, later, in
 * {@link commitStrokeBuffer}, instead of compounding at every overlap.
 *
 * Out-of-bounds cells are ignored.
 */
export const stampStrokePixel = (
	buffer: PixelBuffer,
	x: number,
	y: number,
	r: number,
	g: number,
	b: number,
): void => {
	if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) {
		return;
	}
	const i = (y * buffer.width + x) * 4;
	buffer.data[i] = r;
	buffer.data[i + 1] = g;
	buffer.data[i + 2] = b;
	buffer.data[i + 3] = 255;
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Composite a full-opacity stroke `buffer` into a `base` layer **once**,
 * producing a fresh {@link PixelBuffer}; the inputs are never mutated.
 *
 * - `paint`: the buffer's covered pixels are laid over the base with
 *   source-over at `opacity`. Because the buffer holds each covered pixel at
 *   full alpha, the whole stroke lands as a single uniform coat at `opacity` —
 *   self-overlaps do not darken. A fully-opaque stroke (`opacity === 1`)
 *   reproduces a direct per-pixel paint byte-for-byte.
 * - `erase`: the buffer's coverage is removed from the base with
 *   destination-out at `opacity` — the base RGB is preserved and its alpha is
 *   scaled down by the covered amount (fully cleared at `opacity === 1`).
 *
 * @example
 * // Overlapping a 50%-alpha stroke with itself stays 50%, not 75%.
 * const out = commitStrokeBuffer(base, buffer, "paint", 0.5);
 */
export const commitStrokeBuffer = (
	base: PixelBuffer,
	buffer: PixelBuffer,
	mode: StrokeMode,
	opacity: number,
): PixelBuffer => {
	const { width, height } = base;
	const out = blankPixels(width, height);
	const bs = base.data;
	const bf = buffer.data;
	const od = out.data;
	for (let i = 0; i < od.length; i += 4) {
		const cover = (bf[i + 3]! / 255) * opacity;
		const ba = bs[i + 3]! / 255;
		if (mode === "erase") {
			od[i] = bs[i]!;
			od[i + 1] = bs[i + 1]!;
			od[i + 2] = bs[i + 2]!;
			od[i + 3] = Math.round(ba * (1 - cover) * 255);
			continue;
		}
		const ao = cover + ba * (1 - cover);
		if (ao <= 0) {
			continue;
		}
		for (let c = 0; c < 3; c++) {
			const s = bf[i + c]! / 255;
			const b = bs[i + c]! / 255;
			const co = (s * cover + b * ba * (1 - cover)) / ao;
			od[i + c] = Math.round(clamp01(co) * 255);
		}
		od[i + 3] = Math.round(ao * 255);
	}
	return out;
};
