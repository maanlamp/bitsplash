/**
 * Framerate-independent exponential approach.
 *
 * The fraction of the remaining gap covered depends on `dt / tau`, so a long
 * frame catches up instead of overshooting and a short one does not stall.
 * `tau` is the time constant: the seconds it takes to close ~63% of the gap.
 *
 * @example
 * eased = approach(eased, target, time.dt, 0.25);
 */
export const approach = (
	current: number,
	target: number,
	dt: number,
	tau: number,
): number => {
	if (tau <= 0) {
		return target;
	}
	if (dt <= 0) {
		return current;
	}
	return current + (target - current) * (1 - Math.exp(-dt / tau));
};
