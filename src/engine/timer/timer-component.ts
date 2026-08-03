import { Timeline } from "../animation/timeline";
import type { Seconds } from "../duration";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import type { ValueType } from "../serialization/serializable-value";

/**
 * A one-shot delayed event: once {@link countdown} is `done()`, `TimerSystem`
 * emits {@link event} and destroys the entity.
 *
 * The countdown is a {@link Timeline} — the clock every animation runs on — so
 * a timer captured mid-run resumes instead of restarting. It already ticked in
 * seconds (`time.dt`), so this is plumbing, not a change of units.
 *
 * @example
 * scheduleEvent(ecs, 2 as Seconds, new SpawnEvent(point, id));
 */
@serializable("Timer")
export class TimerComponent {
	@serialize() countdown = new Timeline();
	@serialize() event: ValueType | null;

	constructor(
		remaining: Seconds = 0 as Seconds,
		event: ValueType | null = null,
	) {
		this.countdown.restart(remaining);
		this.event = event;
	}
}
