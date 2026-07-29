import { profiler } from "../profiling/profiler";
import { type UpdateContext, UpdateSystem } from "../system";
import { publishWeatherFrame } from "./weather-frame";

/**
 * Publishes the frame's derived weather — effective scalars, the indoor visual
 * mask, and the gust envelope at this frame's ambient time — so every consumer
 * reads one coherent set of numbers instead of re-deriving around the scheduler's
 * easing step.
 *
 * Lives in `ambientSystems()`, which runs in the bundled game *and* in the
 * editor's edit world, so authoring shows live weather. That placement is exactly
 * why this system creates no entity and writes no serialized field: the edit
 * world's save path diffs a journal replay against that world serialized whole
 * and hard-crashes on drift. Everything it produces lives in a non-serialized
 * store keyed by the ECS.
 */
@profiler("Weather presentation", "Weather")
export class WeatherPresentationSystem implements UpdateSystem {
	update({ ecs }: UpdateContext): void {
		publishWeatherFrame(ecs);
	}
}
