/**
 * The one place the weather chase's time constant lives, and the relationship it
 * has to how long a preset lingers.
 *
 * Separate from the scheduler because catalog validation needs it too. `tau` and
 * `dwell` are two ends of one coupling: if a preset is re-aimed before the eased
 * scalars have arrived, the weather never reads as the preset — it reads as a
 * permanent transition. That is exactly what shipped, `DEFAULT_TAU = 8` against
 * dwells of 8–20 s, and it put rain within 0.02 of its target on 16% of frames
 * for `storm-coast`. The catalog loader now asserts the relationship
 * ({@link minimumDwellSeconds}) so a future dwell shortening fails loudly rather
 * than quietly bringing it back.
 */

/**
 * Seconds for the eased scalars to close ~63% of the gap to their targets.
 *
 * Chosen by measurement, not by argument: stepping the shipped catalog for an
 * hour per climate across 24 seeds, this puts every scalar within 0.02 of its
 * target on 74–84% of frames (against 16–49% at the shipped `8`), while a
 * transition still takes {@link SETTLE_TAUS} × this — six visible seconds — to
 * complete.
 */
export const DEFAULT_TAU = 1.5;

/**
 * Time constants a scalar needs to count as arrived. Four closes 98.2% of the
 * gap, which is well inside the 0.02 tolerance the measurement uses for every
 * scalar in the shipped catalog.
 */
export const SETTLE_TAUS = 4;

/**
 * Shortest dwell a catalog may author for a given chase time constant: a preset
 * must linger long enough for the weather to actually become it.
 *
 * @example
 * entry.dwellMin >= minimumDwellSeconds(DEFAULT_TAU); // or the catalog is rejected
 */
export const minimumDwellSeconds = (tau: number): number =>
	SETTLE_TAUS * tau;
