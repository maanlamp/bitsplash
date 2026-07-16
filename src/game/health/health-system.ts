import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { HealthComponent } from "../health/health-component";
import { profiler } from "../../engine/profiling/profiler";
import { DamageEvent, DeathEvent } from "../events";

@profiler("Health", "Combat")
export class HealthSystem implements UpdateSystem {
	update({ ecs, events }: UpdateContext): void {
		for (const event of events.read(DamageEvent)) {
			const health = ecs.getComponent(event.target, HealthComponent);
			if (!health) {
				continue;
			}
			const previous = health.hp;
			health.hp = Math.max(
				0,
				Math.min(health.maxHp, health.hp - event.amount),
			);
			if (health.hp === 0 && previous > 0) {
				events.emit(new DeathEvent(event.target));
			}
		}
	}
}
