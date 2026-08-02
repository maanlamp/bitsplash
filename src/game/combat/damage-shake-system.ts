import { CameraShakeComponent } from "../../engine/camera/camera-shake-component";
import { profiler } from "../../engine/profiling/profiler";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { HealthComponent } from "../health/health-component";
import { HitsplatStyleComponent } from "../hitsplat/hitsplat-style-component";
import { DamageEvent } from "../events";

const DEFAULT_TRAUMA_PER_HP = 0.015;
const DEFAULT_CRIT_TRAUMA_BONUS = 0.15;

@profiler("Damage shake", "Combat")
export class DamageShakeSystem implements UpdateSystem {
	update({ ecs, events }: UpdateContext): void {
		const damage = events.read(DamageEvent);
		if (damage.length === 0) {
			return;
		}
		const shakeEntry = ecs.queryFirst(CameraShakeComponent);
		if (!shakeEntry) {
			return;
		}
		const shake = shakeEntry[1];
		const style = ecs.queryFirst(HitsplatStyleComponent)?.[1];
		const traumaPerHp = style?.traumaPerHp ?? DEFAULT_TRAUMA_PER_HP;
		const critTraumaBonus =
			style?.critTraumaBonus ?? DEFAULT_CRIT_TRAUMA_BONUS;
		for (const event of damage) {
			if (!ecs.getComponent(event.target, HealthComponent)) {
				continue;
			}
			const bonus = event.crit ? critTraumaBonus : 0;
			shake.trauma = Math.min(
				1,
				shake.trauma + event.amount * traumaPerHp + bonus,
			);
		}
	}
}
