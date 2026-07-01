import { CameraShakeComponent } from "../../engine/camera/camera-shake-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { HealthComponent } from "../health/health-component";
import { DamageEvent } from "../events";

const TRAUMA_PER_HP = 0.03;

export class DamageShakeSystem implements UpdateSystem {
	update({ ecs, events }: UpdateContext): void {
		const damage = events.read(DamageEvent);
		if (damage.length === 0) {
			return;
		}
		const shakeEntry = ecs.query(CameraShakeComponent)[0];
		if (!shakeEntry) {
			return;
		}
		const shake = shakeEntry[1];
		for (const event of damage) {
			if (!ecs.getComponent(event.target, HealthComponent)) {
				continue;
			}
			shake.trauma = Math.min(
				1,
				shake.trauma + event.amount * TRAUMA_PER_HP,
			);
		}
	}
}
