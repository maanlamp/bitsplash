import { profiler } from "../profiling/profiler";
import { type UpdateContext, UpdateSystem } from "../system";
import { LightningStrikeEvent } from "../weather/lightning-strike-event";
import {
	distanceLevel,
	distanceMetresTo,
	listenerAt,
} from "../listener";
import {
	advanceLightningFlash,
	triggerLightningFlash,
} from "./lightning-flash";

/**
 * Turns strikes into flashes: reads {@link LightningStrikeEvent}s published this
 * frame and advances the world's flash envelope.
 *
 * A subscriber, not a caller — the scheduler publishes and this listens, which
 * is what lets the flash be switched off, replaced or joined by other consumers
 * without touching lightning itself. It must run after `LightningSystem` in the
 * same frame, because the world event bus is cleared at the end of one.
 *
 * Distance dims a flash on the same falloff thunder's level uses, so a strike
 * three kilometres away lights the sky faintly instead of as hard as one in the
 * next field.
 */

@profiler("Lightning flash", "Weather")
export class LightningFlashSystem implements UpdateSystem {
	update({ ecs, events, camera, time }: UpdateContext): void {
		const strikes = events.read(LightningStrikeEvent);
		if (strikes.length > 0) {
			const listener = listenerAt(ecs, camera);
			for (const strike of strikes) {
				triggerLightningFlash(
					ecs,
					strike.intensity *
						distanceLevel(
							distanceMetresTo(listener, strike.x, strike.y),
						),
				);
			}
		}
		advanceLightningFlash(ecs, time.dt);
	}
}
