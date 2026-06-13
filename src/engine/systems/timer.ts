import type { ECS } from "../ecs";
import { type UpdateContext, UpdateSystem } from "../system";
import { TimerComponent } from "../components/timer";

export const scheduleEvent = (
	ecs: ECS,
	seconds: number,
	event: object,
): void => {
	ecs.createEntity([new TimerComponent(seconds, event)]);
};

export class TimerSystem implements UpdateSystem {
	update({ time, ecs, events }: UpdateContext): void {
		for (const [id, timer] of ecs.query(TimerComponent)) {
			timer.remaining -= time.dt;
			if (timer.remaining <= 0) {
				events.emit(timer.event);
				ecs.destroyEntity(id);
			}
		}
	}
}
