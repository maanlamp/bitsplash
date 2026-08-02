import type { ReactElement } from "react";
import {
	playerSettings,
	WEATHER_QUALITIES,
	type WeatherQuality,
} from "../../../engine/settings/player-settings";
import {
	MenuSlider,
	MenuStops,
	MenuSwitch,
} from "./settings-widgets";
import { usePlayerSetting } from "./use-player-setting";

const QUALITY_LABELS: Readonly<Record<WeatherQuality, string>> = {
	low: "Low",
	medium: "Medium",
	high: "High",
};

/**
 * One accessibility setting, described once and rendered in two places: the
 * Accessibility tab stacks them, and the first-launch pass walks them one at a
 * time. Keeping them in one list is what stops the two surfaces drifting.
 */
export type AccessibilityItem = Readonly<{
	id: string;
	title: string;
	/** What the setting does, in the player's terms, for the first-launch pass. */
	detail: string;
	/**
	 * The value as it currently stands. The first-launch pass compares it
	 * against the value the item opened on to tell "the player chose this" from
	 * "the player has not touched it".
	 */
	read: () => number | string;
	Control: () => ReactElement;
}>;

const FlashControl = () => {
	const value = usePlayerSetting(() => playerSettings.flashIntensity);
	return (
		<MenuSlider
			label="Lightning flashes"
			value={value}
			onChange={(next) => playerSettings.setFlashIntensity(next)}
		/>
	);
};

const ShakeControl = () => {
	const value = usePlayerSetting(() => playerSettings.cameraShake);
	return (
		<MenuSlider
			label="Camera shake"
			value={value}
			onChange={(next) => playerSettings.setCameraShake(next)}
		/>
	);
};

const DensityControl = () => {
	const value = usePlayerSetting(() => playerSettings.weatherDensity);
	return (
		<MenuSlider
			label="Weather particles"
			value={value}
			onChange={(next) => playerSettings.setWeatherDensity(next)}
		/>
	);
};

const FadesControl = () => {
	const value = usePlayerSetting(() => playerSettings.screenFades);
	return (
		<MenuSwitch
			label="Screen fades"
			value={value}
			onChange={(next) => playerSettings.setScreenFades(next)}
		/>
	);
};

export const WeatherQualityControl = () => {
	const value = usePlayerSetting(() => playerSettings.weatherQuality);
	return (
		<MenuStops
			label="Weather quality"
			value={value}
			stops={WEATHER_QUALITIES}
			labelOf={(stop) => QUALITY_LABELS[stop]}
			onChange={(next) => playerSettings.setWeatherQuality(next)}
		/>
	);
};

/**
 * The accessibility settings, in the order the first-launch pass walks them:
 * the two that can make someone unwell first, then the ones that only change
 * how busy the screen is.
 *
 * Every default is the better-looking game. These are reductions to opt into,
 * not protections to discover you were missing.
 */
export const ACCESSIBILITY_ITEMS: ReadonlyArray<AccessibilityItem> = [
	{
		id: "flash",
		title: "Lightning flashes",
		detail:
			"Storms light the screen when lightning strikes. The flash is always brief, always faded rather than snapped, always under a fifth of the screen and never more than three a second — turning this down dims it further, and zero removes it.",
		read: () => playerSettings.flashIntensity,
		Control: FlashControl,
	},
	{
		id: "shake",
		title: "Camera shake",
		detail:
			"Impacts and hard landings jolt the camera. Turn it down if motion is uncomfortable; zero holds the camera still.",
		read: () => playerSettings.cameraShake,
		Control: ShakeControl,
	},
	{
		id: "fades",
		title: "Screen fades",
		detail:
			"Scene changes fade through black. Off cuts straight to the next scene instead.",
		read: () => (playerSettings.screenFades ? 1 : 0),
		Control: FadesControl,
	},
	{
		id: "density",
		title: "Weather particles",
		detail:
			"How much rain, snow and sand falls at once. Lower means less moving on screen without changing the weather itself.",
		read: () => playerSettings.weatherDensity,
		Control: DensityControl,
	},
	{
		id: "quality",
		title: "Weather quality",
		detail:
			"How much detail the weather is drawn with. Lower is cheaper to draw as well as calmer to look at.",
		read: () => playerSettings.weatherQuality,
		Control: WeatherQualityControl,
	},
];
