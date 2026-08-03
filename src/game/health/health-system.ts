import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { HealthComponent } from "../health/health-component";
import { MortalComponent } from "../respawn/mortal-component";
import { profiler } from "../../engine/profiling/profiler";
import { DamageEvent, DeathEvent } from "../events";

/**
 * Applies damage to health, and emits a `DeathEvent` when health is depleted —
 * but only for entities carrying a {@link MortalComponent}. Health alone never
 * kills: an entity without the marker bottoms out at zero hp and stays alive,
 * so damageable props (target dummies, breakable scenery that only reads its
 * own damage) are authored by omission rather than by special-casing.
 */
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
			if (
				health.hp === 0 &&
				previous > 0 &&
				ecs.getComponent(event.target, MortalComponent)
			) {
				events.emit(new DeathEvent(event.target));
			}
		}
	}
}
