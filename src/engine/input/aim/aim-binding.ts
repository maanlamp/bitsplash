export type AimSourceKind = "pointer" | "analog" | "digital";

export type AimDriveMode = "absolute" | "relative";

export type AimAdapter = "none" | "digitalToAxis";

export type AimAxisBinding = Readonly<{
	source: AimSourceKind;
	drive: AimDriveMode;
}>;

export const validateAimBinding = (
	binding: AimAxisBinding,
): AimAdapter => {
	const { source, drive } = binding;
	if (source === "pointer") {
		if (drive !== "absolute") {
			throw new Error(
				`aim: pointer source only drives absolute aim, got "${drive}"`,
			);
		}
		return "none";
	}
	if (source === "analog") {
		if (drive !== "relative") {
			throw new Error(
				`aim: analog source only drives relative aim, got "${drive}"`,
			);
		}
		return "none";
	}
	if (drive !== "relative") {
		throw new Error(
			`aim: digital source only drives relative aim, got "${drive}"`,
		);
	}
	return "digitalToAxis";
};

export const synthesizeAxis = (
	negative: boolean,
	positive: boolean,
): number => (positive ? 1 : 0) - (negative ? 1 : 0);

export const analogToButton = (
	sample: number,
	threshold: number,
): boolean => Math.abs(sample) >= threshold;
