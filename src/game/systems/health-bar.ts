import type { Seconds } from "../../engine/duration";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { HealthComponent } from "../components/health";
import { HealthBarComponent } from "../components/health-bar";
import { HealthBarStateComponent } from "../components/health-bar-state";

const DAMAGE_DELAY = 0.5 as Seconds;
const SLIDE_TAU = 0.2;
const VISIBLE_DURATION = 4 as Seconds;

export class HealthBarSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		const dtSeconds = (dt / 1000) as Seconds;
		for (const [id, , health] of ecs.query(
			HealthBarComponent,
			HealthComponent,
		)) {
			let state = ecs.getComponent(id, HealthBarStateComponent);
			if (!state) {
				state = new HealthBarStateComponent(health.hp);
				ecs.addComponent(id, state);
				continue;
			}

			if (health.hp !== state.lastHp) {
				state.visible = VISIBLE_DURATION;
			}
			if (health.hp < state.lastHp) {
				state.delay = DAMAGE_DELAY;
			}
			if (health.hp > state.displayed) {
				state.displayed = health.hp;
			}
			state.lastHp = health.hp;
			state.visible = Math.max(
				0,
				state.visible - dtSeconds,
			) as Seconds;

			if (state.delay > 0) {
				state.delay = Math.max(0, state.delay - dtSeconds) as Seconds;
			} else if (state.displayed > health.hp) {
				const factor = 1 - Math.exp(-(dtSeconds / SLIDE_TAU));
				state.displayed += (health.hp - state.displayed) * factor;
				if (state.displayed - health.hp < 0.5) {
					state.displayed = health.hp;
				}
			}
		}
	}
}
