import type { Seconds } from "../duration";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "../serialization/serializable-value";
import { Ease } from "./ease";
import { KeyframesNumber } from "./keyframes";
import { Timeline } from "./timeline";

/**
 * The runtime-target front door: a two-point animation from wherever a value is
 * *now* to a new target, over a duration, shaped by an {@link Ease}.
 *
 * It owns no animation machinery of its own — it is a {@link Timeline} plus a
 * two-key {@link KeyframesNumber} track. Authored animation should reach for
 * those directly; a Tween is for the cases that cannot be authored data even in
 * principle, because `from` is only known at the moment the animation starts (a
 * fade from the current alpha, a slide reversed mid-flight).
 *
 * Because the timeline persists its `elapsed`, a snapshot taken mid-tween
 * **resumes** on restore rather than replaying from the start.
 *
 * @example
 * const tween = new Tween(fade.alpha, 1, 0.4, Ease.OutCubic);
 * tween.tick(dtSeconds);
 * fade.alpha = tween.value();
 */
@serializable("Tween")
export class Tween implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() readonly timeline = new Timeline();

	@serialize() track = new KeyframesNumber();

	constructor(
		from: number = 0,
		to: number = 1,
		duration: number = 0.3,
		ease: Ease = Ease.Linear,
	) {
		this.retarget(from, to, duration, ease);
	}

	/** The value the run starts at. */
	get from(): number {
		return this.track.keys[0]!.value;
	}

	/** The value the run lands on. */
	get to(): number {
		return this.track.keys[this.track.keys.length - 1]!.value;
	}

	/** How far into the run the tween is. */
	get elapsed(): Seconds {
		return this.timeline.elapsed;
	}

	/** How long the whole run takes. */
	get duration(): Seconds {
		return this.timeline.duration;
	}

	/** Advance the run by `dt` **seconds**. */
	tick(dt: Seconds): void {
		this.timeline.tick(dt);
	}

	/** Normalized progress in `[0, 1]`; `1` for a zero-duration tween. */
	progress(): number {
		return this.timeline.t();
	}

	/** The eased value at the current progress. */
	value(): number {
		return this.track.sample(this.timeline.t());
	}

	/** True once the run has reached its duration. */
	done(): boolean {
		return this.timeline.done();
	}

	/**
	 * Aim the tween at a new target and restart it. The track is rebuilt rather
	 * than edited, so a frozen {@link Ease} preset is only ever read.
	 *
	 * @example
	 * slide.retarget(slide.value(), 0, slideOut, Ease.InCubic);
	 */
	retarget(
		from: number,
		to: number,
		duration: number,
		ease: Ease = Ease.Linear,
	): void {
		this.track = KeyframesNumber.fromTo(from, to, ease);
		this.timeline.restart(duration);
	}
}
