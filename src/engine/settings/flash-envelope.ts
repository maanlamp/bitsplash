/**
 * The hard limits a full-screen flash may never exceed, whatever the player set.
 *
 * These are the published photosensitivity guidance (Xbox Accessibility
 * Guideline 118, Epilepsy Foundation): no more than three flashes per second,
 * flash area under a fifth of the screen, fade rather than hard on/off, and no
 * high-contrast white-on-black. Roughly 1 in 4,000 people can seize from
 * violating them, so they are a floor and not a preference — the accessibility
 * setting scales intensity **within** this envelope and can never widen it.
 */
export const FLASH_ENVELOPE = {
	/** Flashes per second the scheduler may let through. */
	maxPerSecond: 3,
	/** Fraction of the screen a flash may cover. */
	maxScreenArea: 0.2,
	/**
	 * Peak alpha of the flash overlay. Well short of opaque, so the flash reads
	 * as a brightening of the scene rather than white-on-black.
	 */
	maxAlpha: 0.55,
	/** Shortest fade in and out, in seconds. A flash is never a hard cut. */
	minFadeSeconds: 0.06,
} as const;

const clamp01 = (value: number): number =>
	Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/**
 * The peak alpha a flash at `intensity` (`0..1`, the player's accessibility
 * setting) is allowed to reach.
 *
 * The **only** way an intensity becomes an alpha. Because the conversion clamps
 * here, a setting that somehow held a larger number still cannot produce a
 * flash outside {@link FLASH_ENVELOPE} — the envelope is enforced by
 * construction rather than by every call site remembering it.
 *
 * @example
 * flashAlpha(playerSettings.flashIntensity); // <= FLASH_ENVELOPE.maxAlpha
 */
export const flashAlpha = (intensity: number): number =>
	clamp01(intensity) * FLASH_ENVELOPE.maxAlpha;
