import { profiler } from "../profiling/profiler";
import { type UpdateContext, UpdateSystem } from "../system";
import { hasClimates } from "./climate-registry";
import { exposureAt, rainAudioAnchor } from "./exposure";
import { gustEnvelope } from "./gust";
import { WeatherAmbience } from "./weather-ambience";
import { distanceLevel, listenerAt, metresOf } from "../listener";
import {
	PRECIPITATION_HALF_LEVEL_METRES,
	type ShelterState,
	shelterTarget,
	smoothShelter,
	weatherAudioMix,
} from "./weather-audio-mix";
import { weatherFrame } from "./weather-frame";

/**
 * Sounds the weather: reads the frame's **raw** wind and precipitation channels,
 * works out how much of it reaches the listener, and pushes the result at this
 * world's ambience graph.
 *
 * The consumption split is the point of the feature. Visual consumers read the
 * indoor-masked scalars and go still inside; this reads the raw pair and attenuates
 * with the exposure muffle instead, because a cave should sound like it has weather
 * outside it. Shelter is smoothed here — `exposure.ts` deliberately smooths nothing
 * — so a doorway swells rather than switches.
 *
 * **The listener is the active camera**, since the engine has no listener concept:
 * `ctx.camera`, falling back to a query and then to the world origin, which is the
 * same fallback the exposure field's own window uses.
 *
 * Lives in `ambientSystems()`, so it also runs in the editor's edit world, whose
 * save path diffs a journal replay against that world serialized whole and crashes
 * on drift. It therefore creates no entity and writes no serialized field: the only
 * state it owns is the smoothed shelter and the voice graph, both on this instance.
 *
 * The graph plays on the world's ambience bus and stops when that world is
 * disposed. Muting, pause and focus are the bus's business, not this system's:
 * it pushes parameters unconditionally and something upstream decides whether
 * they are heard.
 */
@profiler("Weather audio", "Weather")
export class WeatherAudioSystem implements UpdateSystem {
	/** `null` until the first frame, which snaps instead of swelling from open sky. */
	private shelter: ShelterState | null = null;
	private ambience: WeatherAmbience | null = null;

	update({ ecs, audio, camera, time, world }: UpdateContext): void {
		if (!hasClimates()) {
			return;
		}
		const listener = listenerAt(ecs, camera);
		const { x, y } = listener;
		const anchor = rainAudioAnchor(ecs, x, y);
		const target = shelterTarget(
			exposureAt(ecs, x, y),
			anchor.distance,
			x,
			anchor.centroid.x,
		);
		this.shelter =
			this.shelter === null
				? target
				: smoothShelter(this.shelter, target, time.dt);

		const frame = weatherFrame(ecs);
		if (!this.ambience) {
			const ambience = new WeatherAmbience(
				audio,
				world.audio.ambience,
			);
			this.ambience = ambience;
			world.onDispose(() => ambience.stop());
		}
		this.ambience.push(
			weatherAudioMix(
				{
					wind: frame.wind,
					precipitation: frame.precipitation,
					gust: gustEnvelope(frame.time, frame.wind),
					proximity: distanceLevel(
						metresOf(listener.z),
						PRECIPITATION_HALF_LEVEL_METRES,
					),
				},
				this.shelter,
			),
		);
	}
}
