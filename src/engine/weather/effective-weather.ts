import type { ReadonlyECS } from "../ecs";
import {
	NO_CHANNELS,
	type PartialWeatherChannels,
	weatherChannels,
	type WeatherChannels,
} from "./channels";
import {
	CALM_PRESET,
	type Climate,
	type ClimatePreset,
	type WeatherRequest,
} from "./climate";
import {
	hasClimates,
	resolveClimate,
	resolvePreset,
} from "./climate-registry";
import { weatherPreview } from "./preview";
import { SceneClimateComponent } from "./scene-climate-component";
import {
	overrideRequest,
	WeatherOverrideComponent,
} from "./weather-override-component";
import { WeatherStateComponent } from "./weather-state-component";

/**
 * Pure per-frame derivation of the weather in force. Nothing here mutates, so it
 * is safe to call from an edit world, a render pass, or a test.
 *
 * Authority runs top-down: **editor preview → highest-priority live override →
 * the scheduler's current preset**. The preview and the override contribute
 * {@link WeatherRequest}s, so a partial one (say, direction only) falls through
 * field by field.
 */

/** The complete set of targets the eased scalars chase. */
export type WeatherTargets = Readonly<{
	/** Preset the targets came from, or `null` when only raw scalars were asked for. */
	presetId: string | null;
	wind: number;
	precipitation: WeatherChannels;
	direction: number;
}>;

/**
 * The weather as consumers see it.
 *
 * The split between raw and masked is the contract, not an implementation
 * detail. **Visual consumers read the masked pair** — `sampleWind` goes calm and
 * precipitation reads zero in an `indoor` scene, so foliage stills and particles
 * stop. **Audio reads the raw pair** and attenuates it with the exposure muffle
 * instead: muffled is not silent, and a cave should still sound like it has
 * weather outside it.
 */
export type EffectiveWeather = Readonly<{
	/** Resolved climate id, or `null` when weather is disabled. */
	climateId: string | null;
	/** Effective preset id, or `null` when no preset is in force. */
	presetId: string | null;
	/** Whether the active scene reads as an interior. */
	indoor: boolean;
	/**
	 * Raw eased wind, `0..1` — the audible weather. Audio combines this with the
	 * exposure muffle (`engine/weather/exposure.ts`) rather than with `indoor`.
	 */
	wind: number;
	/** Raw eased precipitation per channel, each `0..1` — the audible weather. */
	precipitation: WeatherChannels;
	/** Signed horizontal base direction, `-1..1`. */
	direction: number;
	/** Indoor-masked wind — what foliage and particles read. */
	visibleWind: number;
	/** Indoor-masked precipitation per channel — what emitters read. */
	visiblePrecipitation: WeatherChannels;
}>;

/** The authored climate id of the active scene, or `null` to inherit the default. */
export const sceneClimateId = (ecs: ReadonlyECS): string | null =>
	ecs.queryFirst(SceneClimateComponent)?.[1].climateId ?? null;

/** Whether the active scene reads as an interior. */
export const sceneIndoor = (ecs: ReadonlyECS): boolean =>
	ecs.queryFirst(SceneClimateComponent)?.[1].indoor ?? false;

/**
 * The climate scheduling the active scene, or `null` when weather is disabled.
 * Throws when the scene names a climate the catalog does not have.
 */
export const activeClimate = (ecs: ReadonlyECS): Climate | null =>
	hasClimates() ? resolveClimate(sceneClimateId(ecs)) : null;

/**
 * The live override in force: highest priority, ties broken on the
 * lexicographically greatest entity id so the winner is total and survives a
 * save unchanged.
 */
const activeOverride = (
	ecs: ReadonlyECS,
): WeatherOverrideComponent | null => {
	const live = [...ecs.query(WeatherOverrideComponent)];
	live.sort(
		([leftId, left], [rightId, right]) =>
			right.priority - left.priority ||
			(leftId < rightId ? 1 : leftId > rightId ? -1 : 0),
	);
	return live[0]?.[1] ?? null;
};

const fromPreset = (preset: ClimatePreset): WeatherTargets => ({
	presetId: preset.id,
	wind: preset.wind,
	precipitation: preset.precipitation,
	direction: preset.direction,
});

/**
 * Channel-by-channel fall-through: a request supplies the channels it names and
 * defers the rest, so "the storm, but wetter" needs no snow value.
 */
const applyChannels = (
	base: WeatherChannels,
	request: PartialWeatherChannels | null,
): WeatherChannels =>
	request === null
		? base
		: weatherChannels((channel) => request[channel] ?? base[channel]);

const applyRequest = (
	base: WeatherTargets,
	request: WeatherRequest | null,
): WeatherTargets => {
	if (request === null) {
		return base;
	}
	const preset =
		request.presetId === null
			? base
			: fromPreset(resolvePreset(request.presetId));
	return {
		presetId: preset.presetId,
		wind: request.wind ?? preset.wind,
		precipitation: applyChannels(
			preset.precipitation,
			request.precipitation,
		),
		direction: request.direction ?? preset.direction,
	};
};

const targetsFor = (
	ecs: ReadonlyECS,
	climate: Climate | null,
	scheduled: WeatherStateComponent | undefined,
): WeatherTargets => {
	const base =
		climate === null
			? fromPreset(CALM_PRESET)
			: fromPreset(
					(scheduled &&
						climate.entries.find(
							(entry) => entry.preset.id === scheduled.presetId,
						)?.preset) ||
						climate.defaultPreset,
				);
	const override = activeOverride(ecs);
	return applyRequest(
		applyRequest(base, override && overrideRequest(override)),
		weatherPreview(ecs),
	);
};

/**
 * The targets the eased scalars chase this frame, with preview and override
 * layered over the scheduler's current preset.
 *
 * In a world where the scheduler has not run — every edit world, since the
 * scheduler is gameplay-only — the base layer is the resolved climate's default
 * preset, so an authoring view shows that climate's characteristic weather
 * immediately.
 *
 * @example
 * const targets = weatherTargets(ecs); // what the scalars are heading toward
 */
export const weatherTargets = (ecs: ReadonlyECS): WeatherTargets =>
	targetsFor(
		ecs,
		activeClimate(ecs),
		ecs.queryFirst(WeatherStateComponent)?.[1],
	);

/**
 * The weather in force this frame.
 *
 * With run-state present the scalars are the scheduler's eased values, so
 * transitions and override ramps are what consumers see. Without it — an edit
 * world, or any world the scheduler never ran in — the targets stand in directly,
 * which makes an editor preview scrub read instantly instead of easing toward
 * nothing.
 *
 * @example
 * const weather = effectiveWeather(ecs);
 * emitter.rate = base * weather.visiblePrecipitation.rain;
 */
export const effectiveWeather = (
	ecs: ReadonlyECS,
): EffectiveWeather => {
	const climate = activeClimate(ecs);
	const state = ecs.queryFirst(WeatherStateComponent)?.[1];
	const targets = targetsFor(ecs, climate, state);
	const indoor = sceneIndoor(ecs);
	const wind = state ? state.wind : targets.wind;
	const precipitation = state
		? weatherChannels((channel) => state[channel])
		: targets.precipitation;
	return {
		climateId: climate?.id ?? null,
		presetId: targets.presetId,
		indoor,
		wind,
		precipitation,
		direction: state ? state.direction : targets.direction,
		visibleWind: indoor ? 0 : wind,
		visiblePrecipitation: indoor ? NO_CHANNELS : precipitation,
	};
};
