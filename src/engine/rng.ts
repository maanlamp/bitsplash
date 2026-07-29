/**
 * A seeded pseudo-random generator as a pure step function, so a generator's
 * whole position is one `uint32` a component can serialize.
 *
 * There is no stateful `Rng` object on purpose: the only way to advance is to
 * take the returned state and pass it to the next call, which makes "I forgot to
 * write the state back" a visible dangling value rather than a silent
 * correlation bug, and makes capture → restore → continue exact by construction.
 */

/** A drawn value in `[0, 1)` paired with the state that produced the next draw. */
export type RngDraw = readonly [value: number, next: number];

/**
 * One mulberry32 step. The state is a plain counter, so every `uint32` — zero
 * included — is a valid seed and no state can degenerate.
 *
 * @example
 * const [roll, next] = rngNext(state.rng);
 * state.rng = next;
 */
export const rngNext = (state: number): RngDraw => {
	const next = (state + 0x6d2b79f5) | 0;
	let t = next;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return [((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000, next >>> 0];
};

/**
 * A fresh unpredictable seed, for run-state that is created rather than
 * restored. Callers that need reproducibility inject their own seed instead.
 */
export const randomRngSeed = (): number =>
	(Math.random() * 0x1_0000_0000) >>> 0;
