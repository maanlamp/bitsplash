import type { Seconds } from "../duration";
import type { ReadonlyECS } from "../ecs";
import { ambientTime } from "./ambient-clock";
import {
	type EffectiveWeather,
	effectiveWeather,
} from "./effective-weather";

/**
 * The {@link EffectiveWeather} published once per frame, stamped with the ambient
 * time it was derived at, so every consumer in a frame reads the same numbers.
 *
 * Without this, systems calling {@link effectiveWeather} at different points in
 * the update list would straddle the scheduler's easing step and disagree about
 * the wind by a frame. `WeatherPresentationSystem` publishes; consumers read.
 *
 * Stored in a module `WeakMap` keyed by the ECS, like the ambient clock and for
 * the same reason: ambient systems run in the editor's live edit world, whose
 * save path serializes that world whole and crashes on drift, so nothing ambient
 * may be representable as component state.
 */
export type WeatherFrame = EffectiveWeather &
	Readonly<{
		/** Ambient seconds this frame was derived at. */
		time: Seconds;
	}>;

const frames = new WeakMap<ReadonlyECS, WeatherFrame>();

const derive = (ecs: ReadonlyECS): WeatherFrame => ({
	...effectiveWeather(ecs),
	time: ambientTime(ecs),
});

/**
 * Derive and publish this frame's weather. Called once per frame by
 * `WeatherPresentationSystem`; returns what it published.
 */
export const publishWeatherFrame = (
	ecs: ReadonlyECS,
): WeatherFrame => {
	const frame = derive(ecs);
	frames.set(ecs, frame);
	return frame;
};

/**
 * This frame's published weather. In a world with no presentation system it
 * derives on demand instead of reporting a stale calm — correct values, minus
 * only the guarantee that two callers in one frame saw the same ones.
 *
 * @example
 * const { visiblePrecipitation } = weatherFrame(ecs);
 */
export const weatherFrame = (ecs: ReadonlyECS): WeatherFrame =>
	frames.get(ecs) ?? derive(ecs);
