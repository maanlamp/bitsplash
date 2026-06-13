import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { HealthBarComponent } from "../components/health-bar";
import { HealthComponent } from "../components/health";

const DAMAGE_DELAY = 0.5;
const SLIDE_TAU = 0.2;
const VISIBLE_DURATION = 4;

export class HealthBarSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		const dtSeconds = dt / 1000;
		for (const [id, health] of ecs.query(HealthComponent)) {
			let bar = ecs.getComponent(id, HealthBarComponent);
			if (!bar) {
				bar = new HealthBarComponent(health.hp);
				ecs.addComponent(id, bar);
				continue;
			}

			if (health.hp !== bar.lastHp) {
				bar.visible = VISIBLE_DURATION;
			}
			if (health.hp < bar.lastHp) {
				bar.delay = DAMAGE_DELAY;
			}
			if (health.hp > bar.displayed) {
				bar.displayed = health.hp;
			}
			bar.lastHp = health.hp;
			bar.visible = Math.max(0, bar.visible - dtSeconds);

			if (bar.delay > 0) {
				bar.delay = Math.max(0, bar.delay - dtSeconds);
			} else if (bar.displayed > health.hp) {
				const factor = 1 - Math.exp(-dtSeconds / SLIDE_TAU);
				bar.displayed += (health.hp - bar.displayed) * factor;
				if (bar.displayed - health.hp < 0.5) {
					bar.displayed = health.hp;
				}
			}
		}
	}
}
