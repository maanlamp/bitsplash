import { WEATHER_CHANNELS } from "../weather/channels";
import type { WeatherFrame } from "../weather/weather-frame";

/**
 * How much the live weather scales a part's emission, and the one place that
 * scaling is computed.
 *
 * Every precipitation channel plus `wind` is a **source** a part may name. The
 * tuple is the type-safe cross-reference — a source is reached through
 * {@link VFX_WEATHER_SOURCES} or the {@link VfxWeatherSource} union derived from
 * it, never as a bare string literal — and it is derived from
 * {@link WEATHER_CHANNELS}, so a new channel becomes authorable in effect defs
 * without anything here changing.
 */

/** Wind is a peer scalar rather than a channel, so it is named separately. */
const WIND_SOURCE = "wind";

export const VFX_WEATHER_SOURCES = [
	...WEATHER_CHANNELS,
	WIND_SOURCE,
] as const;

export type VfxWeatherSource = (typeof VFX_WEATHER_SOURCES)[number];

/**
 * A part's influence per weather source.
 *
 * Each is an **influence** in `0..1` interpolating between "ignore the weather"
 * (`0`, the factor stays one) and "track it exactly" (`1`, the factor becomes
 * the weather scalar itself), and every source multiplies. Rain therefore
 * authors `rain: 1` and stops dead in clear weather; blood authors nothing and
 * never notices the sky.
 *
 * The scalars read are the **indoor-masked** visible ones, so an indoor scene
 * stills every weather-driven effect for free.
 */
export type VfxWeatherScaling = Readonly<
	Record<VfxWeatherSource, number>
>;

/** No source influences this part; the factor is always one. */
export const NO_VFX_WEATHER_SCALING: VfxWeatherScaling =
	Object.freeze(
		Object.fromEntries(
			VFX_WEATHER_SOURCES.map((source) => [source, 0]),
		) as Record<VfxWeatherSource, number>,
	);

/**
 * Whether any source moves this part at all — the test for "this is weather",
 * which is what makes the player's weather-quality and density settings apply to
 * rain and snow while leaving blood and fire alone.
 */
export const isWeatherDriven = (
	scaling: VfxWeatherScaling,
): boolean =>
	VFX_WEATHER_SOURCES.some((source) => scaling[source] > 0);

/**
 * The scalar this frame's weather multiplies a part's emission by: particles per
 * second for an emitter part, concurrent ribbons and their opacity for a ribbon
 * part.
 *
 * @example
 * const rate = part.rate * rateScale * vfxWeatherInfluence(part.weather, weather);
 */
export const vfxWeatherInfluence = (
	scaling: VfxWeatherScaling,
	weather: WeatherFrame,
): number => {
	let factor = 1 + scaling[WIND_SOURCE] * (weather.visibleWind - 1);
	for (const channel of WEATHER_CHANNELS) {
		factor *=
			1 +
			scaling[channel] * (weather.visiblePrecipitation[channel] - 1);
	}
	return factor;
};
