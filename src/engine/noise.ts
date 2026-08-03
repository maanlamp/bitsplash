/**
 * Smooth value noise in one and two dimensions, and the integer hashes it is
 * built from.
 *
 * Deliberately separate from `hash.ts`: {@link hashCell} is contracted to be
 * keyed by position only and never time-based, and that contract stays intact.
 * These helpers exist for the opposite job — a continuous signal sampled over an
 * axis or a plane that may well be time, typically the weather slice's wind
 * field. They are still pure and stateless, so nothing here ever needs saving.
 */

const UNIT = 0x1_0000_0000;

/**
 * Deterministic 32-bit hash of one integer plus a salt, so independent signals
 * (a wander band, a gust band, a per-instance phase) can be derived from the
 * same index without correlating.
 *
 * @example
 * const strength = hash1(gustCell, 0x9e37) / 0x1_0000_0000; // [0, 1)
 */
export const hash1 = (n: number, salt: number): number => {
	let h = Math.imul(n | 0, 2654435761);
	h = Math.imul(h ^ salt, 2246822519);
	h = Math.imul(h ^ (h >>> 13), 3266489917);
	return (h ^ (h >>> 16)) >>> 0;
};

/**
 * {@link hash1} folded into `[0, 1)` — the unit draw every band, phase and
 * jitter derived from an integer index starts from.
 *
 * @example
 * const strength = hashUnit(gustCell, 0x9e37); // [0, 1)
 */
export const hashUnit = (n: number, salt: number): number =>
	hash1(n, salt) / UNIT;

/** Clamp to `[0, 1]` — the shared saturating helper of every `0..1` signal. */
export const clamp01 = (value: number): number =>
	value < 0 ? 0 : value > 1 ? 1 : value;

/**
 * The classic ease curve `3t² - 2t³`, clamped to `[0, 1]`. Shared interpolant of
 * {@link valueNoise1} and its consumers, so bands shaped by hand match the noise
 * they ride on.
 */
export const smoothstep = (t: number): number => {
	const k = t < 0 ? 0 : t > 1 ? 1 : t;
	return k * k * (3 - 2 * k);
};

/**
 * Smooth 1-D value noise in `[0, 1)`: hashed lattice values interpolated with
 * {@link smoothstep}, so the signal is continuous and has no corners where cells
 * meet. Feed it a continuous input scaled to the band you want — `t * 0.1` for a
 * ~0.1 Hz wander.
 *
 * @example
 * const wander = valueNoise1(ambientSeconds * 0.1, 0x571e);
 */
export const valueNoise1 = (t: number, salt: number): number => {
	const cell = Math.floor(t);
	const a = hashUnit(cell, salt);
	const b = hashUnit(cell + 1, salt);
	return a + (b - a) * smoothstep(t - cell);
};

const Y_STRIDE = 0x27d4_eb2d;

/**
 * {@link hash1} over a lattice point, folded into `[0, 1)`. The two coordinates
 * are mixed before hashing, so `(3, 7)` and `(7, 3)` are unrelated draws.
 *
 * @example
 * const strength = hashUnit2(gustCell, gustRow, 0x9e37); // [0, 1)
 */
export const hashUnit2 = (
	x: number,
	y: number,
	salt: number,
): number => hash1((x | 0) ^ Math.imul(y | 0, Y_STRIDE), salt) / UNIT;

/**
 * Smooth 2-D value noise in `[0, 1)`: the four surrounding lattice draws
 * bilinearly blended with {@link smoothstep}, so the field is continuous in both
 * axes and no cell boundary shows. Four hashes and no allocation, which is what
 * makes it safe to sample per particle per frame.
 *
 * Feed it coordinates already divided by the cell size you want.
 *
 * @example
 * const gust = valueNoise2(x / 240, y / 960, 0x2f9b);
 */
export const valueNoise2 = (
	x: number,
	y: number,
	salt: number,
): number => {
	const cellX = Math.floor(x);
	const cellY = Math.floor(y);
	const fx = smoothstep(x - cellX);
	const fy = smoothstep(y - cellY);
	const x0y0 = hashUnit2(cellX, cellY, salt);
	const x1y0 = hashUnit2(cellX + 1, cellY, salt);
	const x0y1 = hashUnit2(cellX, cellY + 1, salt);
	const x1y1 = hashUnit2(cellX + 1, cellY + 1, salt);
	const top = x0y0 + (x1y0 - x0y0) * fx;
	const bottom = x0y1 + (x1y1 - x0y1) * fx;
	return top + (bottom - top) * fy;
};
