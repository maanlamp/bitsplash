/**
 * Perceptual exponent for a volume control.
 *
 * Stevens' power law puts loudness at `amplitude ** 0.6`, so raising position to
 * its reciprocal makes loudness linear in the position the player set. 50%
 * lands at −10 dB, the established "half as loud" figure, and 100% is unity.
 */
const VOLUME_EXPONENT = 1.67;

/**
 * The gain a volume control at `position` (`0..1`) should apply.
 *
 * The one implementation of the curve. A slider, a settings store and any future
 * consumer all call this rather than each carrying the exponent.
 *
 * @example
 * volumeGain(1); // 1
 * volumeGain(0.5); // ~0.314, i.e. -10 dB
 */
export const volumeGain = (position: number): number =>
	Math.max(0, position) ** VOLUME_EXPONENT;
