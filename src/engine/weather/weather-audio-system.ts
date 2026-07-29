import { webAudioAvailable } from "../audio/availability";
import { pickActiveCamera2D } from "../camera/camera-2d-render";
import { profiler } from "../profiling/profiler";
import { type UpdateContext, UpdateSystem } from "../system";
import { hasClimates } from "./climate-registry";
import { exposureAt, rainAudioAnchor } from "./exposure";
import { gustEnvelope } from "./gust";
import { pushWeatherAmbience } from "./weather-ambience";
import {
	type ShelterState,
	shelterTarget,
	smoothShelter,
	weatherAudioMix,
} from "./weather-audio-mix";
import { weatherFrame } from "./weather-frame";

/**
 * Sounds the weather: reads the frame's **raw** wind and precipitation, works out
 * how much of it reaches the listener, and pushes the result at the process-wide
 * ambience graph.
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
 * state it owns is the smoothed shelter on this instance, and the node graph, which
 * belongs to the audio manager rather than to any world.
 *
 * Silent by construction where WebAudio does not exist — the gate is checked before
 * the audio service is so much as read, because headless hosts supply stand-ins
 * that throw on any property access.
 */
@profiler("Weather audio", "Weather")
export class WeatherAudioSystem implements UpdateSystem {
	/** `null` until the first frame, which snaps instead of swelling from open sky. */
	private shelter: ShelterState | null = null;

	update({ ecs, audio, camera, time }: UpdateContext): void {
		if (!webAudioAvailable || !hasClimates()) {
			return;
		}
		const listener =
			(camera ?? pickActiveCamera2D(ecs))?.position ?? null;
		const x = listener?.x ?? 0;
		const y = listener?.y ?? 0;
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
		pushWeatherAmbience(
			audio,
			weatherAudioMix(
				{
					wind: frame.wind,
					precipitation: frame.precipitation,
					gust: gustEnvelope(frame.time, frame.wind),
				},
				this.shelter,
			),
		);
	}
}
