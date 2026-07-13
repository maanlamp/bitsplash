const TWO_PI = Math.PI * 2;

export const normalizeAngle = (angle: number): number => {
	let a = angle % TWO_PI;
	if (a <= -Math.PI) {
		a += TWO_PI;
	} else if (a > Math.PI) {
		a -= TWO_PI;
	}
	return a;
};

export const applyDeadzone = (
	value: number,
	deadzone: number,
): number => {
	const clampedDeadzone = Math.min(Math.max(deadzone, 0), 0.999);
	const magnitude = Math.abs(value);
	if (magnitude <= clampedDeadzone) {
		return 0;
	}
	const scaled =
		(magnitude - clampedDeadzone) / (1 - clampedDeadzone);
	return Math.sign(value) * Math.min(scaled, 1);
};

export const shapeAxis = (
	value: number,
	deadzone: number,
	curve: number,
): number => {
	const gated = applyDeadzone(value, deadzone);
	if (gated === 0) {
		return 0;
	}
	const exponent = curve > 0 ? curve : 1;
	return Math.sign(gated) * Math.pow(Math.abs(gated), exponent);
};
