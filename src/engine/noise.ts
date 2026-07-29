/**
 * Smooth 1-D value noise and the integer hash it is built from.
 *
 * Deliberately separate from `hash.ts`: {@link hashCell} is contracted to be
 * keyed by position only and never time-based, and that contract stays intact.
 * These helpers exist for the opposite job — a continuous signal sampled along
 * one axis, typically the weather slice's ambient clock. They are still pure and
 * stateless, so nothing here ever needs saving.
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
