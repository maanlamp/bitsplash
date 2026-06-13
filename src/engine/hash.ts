/**
 * Deterministic 32-bit hash of a grid coordinate plus a salt, so independent
 * decisions (presence, sprite, flip, ...) can be derived per cell without
 * correlating. Keyed by position only — stable across frames, never time-based.
 */
export const hashCell = (
	x: number,
	y: number,
	salt: number,
): number => {
	let h = Math.imul(x | 0, 374761393);
	h = Math.imul(h ^ (y | 0), 668265263);
	h = Math.imul(h ^ salt, 2246822519);
	h = Math.imul(h ^ (h >>> 13), 3266489917);
	return (h ^ (h >>> 16)) >>> 0;
};
