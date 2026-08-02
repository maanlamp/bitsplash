import type { AudioApi } from "../../engine/audio/audio-api";
import { profiler } from "../../engine/profiling/profiler";
import { rngNext } from "../../engine/rng";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { LightningStrikeEvent } from "../../engine/weather/lightning-strike-event";
import {
	distanceMetresTo,
	type Listener,
	listenerAt,
	metresOf,
} from "../../engine/listener";
import { THUNDER_BANK } from "./thunder-bank";
import { placeThunder } from "./thunder-placement";

/**
 * Sounds a strike: reads {@link LightningStrikeEvent}s and plays the placed
 * layers on the world's sfx bus.
 *
 * Every take is preloaded through `AudioApi.load` and played with `playBuffer`.
 * **`AudioManager.play()` is not used and must not be**: it is documented silent
 * on the first play of any URL, which for thunder means the first clap of a
 * storm — the one that matters — going missing.
 *
 * The clap is placed by `placeThunder` from a generator seeded with the strike's
 * own seed, so which takes were picked is a property of the strike rather than
 * of when the system happened to run.
 *
 * A subscriber of the strike event, like the flash: it must run in the same
 * frame as `LightningSystem` and after it, because the world event bus is
 * cleared at the end of a frame.
 */
@profiler("Thunder", "Weather")
export class ThunderSystem implements UpdateSystem {
	private readonly buffers = new Map<string, AudioBuffer>();
	private warmed = false;

	update(ctx: UpdateContext): void {
		this.warm(ctx.audio);
		const strikes = ctx.events.read(LightningStrikeEvent);
		if (strikes.length === 0) {
			return;
		}
		const listener = listenerAt(ctx.ecs, ctx.camera);
		for (const strike of strikes) {
			this.clap(ctx, strike, listener);
		}
	}

	/**
	 * Preload every take once. `load` caches per url, so a failed or pending load
	 * simply leaves that layer out of the clap rather than stalling anything.
	 */
	private warm(audio: AudioApi): void {
		if (this.warmed) {
			return;
		}
		this.warmed = true;
		for (const take of THUNDER_BANK) {
			void audio
				.load(take.url)
				.then((buffer) => this.buffers.set(take.url, buffer))
				.catch(() => {});
		}
	}

	private clap(
		ctx: UpdateContext,
		strike: LightningStrikeEvent,
		listener: Listener,
	): void {
		const lateral = metresOf(strike.x - listener.x);
		const distance = distanceMetresTo(listener, strike.x, strike.y);
		let rng = strike.seed;
		const random = (): number => {
			const [value, next] = rngNext(rng);
			rng = next;
			return value;
		};
		for (const voice of placeThunder(distance, lateral, random)) {
			const buffer = this.buffers.get(voice.take.url);
			if (!buffer) {
				continue;
			}
			ctx.audio.playBuffer(buffer, {
				bus: ctx.world.audio.sfx,
				offset: voice.offset,
				delay: voice.delay,
				gain: voice.gain * strike.intensity,
				lowpass: voice.lowpass,
				pan: voice.pan,
			});
		}
	}
}
