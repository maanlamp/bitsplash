import type { ReadonlyECS } from "../../engine/ecs";
import type {
	ClimatePreset,
	WeatherRequest,
} from "../../engine/weather/climate";
import { resolvePreset } from "../../engine/weather/climate-registry";
import { activeClimate } from "../../engine/weather/effective-weather";

/**
 * What the weather preview popover shows, and how it maps onto the engine's
 * preview request.
 *
 * Real dwell times mean an authoring session would otherwise see no weather
 * transitions at all, so the popover exists to make every state reachable
 * instantly. The scrub is a {@link WeatherRequest} in disguise: a preset supplies
 * all three scalars and the explicit wind/precipitation ride over it, which is
 * why picking a preset and then dragging wind is representable without inventing
 * a preset.
 *
 * Direction is deliberately absent — the plan asks for wind and precipitation
 * scrubs only, so the preset's own direction always stands.
 */
export type WeatherPreviewState = Readonly<{
	/** Preset the scrub started from. Always a live catalog preset id. */
	presetId: string;
	/** Scrubbed wind, `0..1`. */
	wind: number;
	/** Scrubbed precipitation, `0..1`. */
	precipitation: number;
}>;

/** The scrub a preset reads as before anything is dragged: its own targets. */
const previewStateOfPreset = (
	preset: ClimatePreset,
): WeatherPreviewState => ({
	presetId: preset.id,
	wind: preset.wind,
	precipitation: preset.precipitation,
});

/**
 * The scrub a catalog preset id reads as. Throws on an id the catalog does not
 * have, which is unreachable from the picker — it is populated from the catalog.
 */
export const previewStateOfPresetId = (
	presetId: string,
): WeatherPreviewState =>
	previewStateOfPreset(resolvePreset(presetId));

/**
 * The scrub a view opens on: the resolved climate's default preset, or `null`
 * when weather is disabled because no catalog is registered.
 *
 * @example
 * const scrub = defaultWeatherPreviewState(view.scene.world.ecs);
 */
export const defaultWeatherPreviewState = (
	ecs: ReadonlyECS,
): WeatherPreviewState | null => {
	const climate = activeClimate(ecs);
	return climate ? previewStateOfPreset(climate.defaultPreset) : null;
};

/**
 * The preview request a scrub installs. The explicit scalars always win over the
 * preset they came from, and `direction` falls through to it.
 *
 * @example
 * setWeatherPreview(ecs, weatherPreviewRequest(scrub));
 */
export const weatherPreviewRequest = (
	state: WeatherPreviewState,
): WeatherRequest => ({
	presetId: state.presetId,
	wind: state.wind,
	precipitation: state.precipitation,
	direction: null,
});
