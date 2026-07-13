import type { SettingsStore } from "../settings-store";

export const AIM_SETTINGS_KEYS = {
	sensitivity: "input.aim.sensitivityRadPerSec",
	deadzone: "input.aim.deadzone",
	responseCurve: "input.aim.responseCurve",
} as const;

export type AimSettingsValues = Readonly<{
	sensitivity: number;
	deadzone: number;
	responseCurve: number;
}>;

export const DEFAULT_AIM_SETTINGS: AimSettingsValues = {
	sensitivity: 3.5,
	deadzone: 0.15,
	responseCurve: 1.5,
};

const readNumber = (
	store: SettingsStore,
	key: string,
	fallback: number,
): number => {
	const raw = store.get(key);
	if (raw === null) {
		return fallback;
	}
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : fallback;
};

export const readAimSettings = (
	store: SettingsStore,
): AimSettingsValues => ({
	sensitivity: readNumber(
		store,
		AIM_SETTINGS_KEYS.sensitivity,
		DEFAULT_AIM_SETTINGS.sensitivity,
	),
	deadzone: readNumber(
		store,
		AIM_SETTINGS_KEYS.deadzone,
		DEFAULT_AIM_SETTINGS.deadzone,
	),
	responseCurve: readNumber(
		store,
		AIM_SETTINGS_KEYS.responseCurve,
		DEFAULT_AIM_SETTINGS.responseCurve,
	),
});

export const writeAimSettings = (
	store: SettingsStore,
	values: AimSettingsValues,
): void => {
	store.set(
		AIM_SETTINGS_KEYS.sensitivity,
		String(values.sensitivity),
	);
	store.set(AIM_SETTINGS_KEYS.deadzone, String(values.deadzone));
	store.set(
		AIM_SETTINGS_KEYS.responseCurve,
		String(values.responseCurve),
	);
};
