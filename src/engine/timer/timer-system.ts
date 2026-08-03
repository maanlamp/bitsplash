import type { Seconds } from "../duration";
import type { ECS } from "../ecs";
import { profiler } from "../profiling/profiler";
import type { ValueType } from "../serialization/serializable-value";
import { type UpdateContext, UpdateSystem } from "../system";
import { TimerComponent } from "../timer/timer-component";

export const scheduleEvent = (
	ecs: ECS,
	delay: Seconds,
	event: ValueType,
): void => {
	ecs.createEntity([new TimerComponent(delay, event)]);
};

@profiler("Timers", "Sequence")
export class TimerSystem implements UpdateSystem {
	update({ time, ecs, events }: UpdateContext): void {
		for (const [id, timer] of ecs.query(TimerComponent)) {
			timer.countdown.tick(time.dt);
			if (timer.countdown.done()) {
				if (timer.event) {
					events.emit(timer.event);
				}
				ecs.destroy(id);
			}
		}
	}
}
