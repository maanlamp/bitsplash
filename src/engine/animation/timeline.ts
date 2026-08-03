import type { Seconds } from "../duration";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "../serialization/serializable-value";

/**
 * A bounded, once-only clock: the time base every animation primitive runs on.
 *
 * Both `elapsed` and `duration` persist, so a restored animation **resumes**
 * where it was saved instead of restarting. There is no looping mode — ambient
 * loops are stateless phase sampling off a shared clock, not a Timeline.
 *
 * A zero-duration timeline is defined rather than degenerate: it is `done()`
 * from the start and reports `t() === 1`, so a fade authored with no duration
 * lands on its end state instead of dividing by zero.
 *
 * @example
 * const timeline = new Timeline(0.4);
 * timeline.tick(dt);
 * const alpha = track.sample(timeline.t());
 * if (timeline.done()) { … }
 */
@serializable("Timeline")
export class Timeline implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() duration: Seconds;

	@serialize() elapsed = 0 as Seconds;

	/**
	 * Signed playback multiplier applied by {@link tick}. Reserved for
	 * playback control (scrubbing, reversal); `done()` and `t()` describe
	 * forward playback, and a negative rate simply rewinds towards `0`.
	 */
	@serialize() rate: number;

	constructor(duration: number = 0, rate: number = 1) {
		this.duration = duration as Seconds;
		this.rate = rate;
	}

	/** Advance by `dt` seconds scaled by {@link rate}, clamped to `[0, duration]`. */
	tick(dt: Seconds): void {
		const next = this.elapsed + dt * this.rate;
		this.elapsed = Math.min(
			this.duration,
			Math.max(0, next),
		) as Seconds;
	}

	/** Normalized progress in `[0, 1]`; `1` for a zero-duration timeline. */
	t(): number {
		return this.duration > 0 ? this.elapsed / this.duration : 1;
	}

	/** True once `elapsed` has reached `duration`. */
	done(): boolean {
		return this.elapsed >= this.duration;
	}

	/** Seconds left before {@link done}, never negative. */
	remaining(): Seconds {
		return Math.max(0, this.duration - this.elapsed) as Seconds;
	}

	/**
	 * Tail-fade alpha in `[0, 1]`: fully opaque until `fade` seconds are left,
	 * then a linear ramp reaching `0` exactly as the run ends. A non-positive
	 * `fade` means no ramp — opaque until `done()`, then gone.
	 *
	 * @example
	 * sprite.opacity.set(arrow.stuck.fadeOut(arrow.fade.seconds));
	 */
	fadeOut(fade: Seconds): number {
		if (fade <= 0) {
			return this.done() ? 0 : 1;
		}
		return Math.min(1, this.remaining() / fade);
	}

	/** Rewind to zero, optionally retiming the run. */
	restart(duration?: number): void {
		if (duration !== undefined) {
			this.duration = duration as Seconds;
		}
		this.elapsed = 0 as Seconds;
	}
}
