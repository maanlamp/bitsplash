import type { Seconds } from "../duration";
import type { ECS } from "../ecs";
import { type UpdateContext, UpdateSystem } from "../system";
import { TimerComponent } from "../timer/timer-component";

export const scheduleEvent = (
	ecs: ECS,
	delay: Seconds,
	event: object,
): void => {
	ecs.createEntity([new TimerComponent(delay, event)]);
};

export class TimerSystem implements UpdateSystem {
	update({ time, ecs, events }: UpdateContext): void {
		for (const [id, timer] of ecs.query(TimerComponent)) {
			timer.remaining = (timer.remaining - time.dt) as Seconds;
			if (timer.remaining <= 0) {
				events.emit(timer.event);
				ecs.destroyEntity(id);
			}
		}
	}
}
