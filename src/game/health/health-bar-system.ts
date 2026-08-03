import type { Seconds } from "../../engine/duration";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { HealthComponent } from "../health/health-component";
import { HealthBarComponent } from "../health/health-bar-component";
import { HealthBarStateComponent } from "../health/health-bar-state-component";
import { profiler } from "../../engine/profiling/profiler";

const DAMAGE_DELAY = 0.5 as Seconds;
const SLIDE_TAU = 0.2;
const VISIBLE_DURATION = 4 as Seconds;

/** Health bars run on milliseconds `dt`, converted once per frame. */
@profiler("Health bars", "HUD")
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
				state.visible.restart(VISIBLE_DURATION);
			}
			if (health.hp < state.lastHp) {
				state.delay.restart(DAMAGE_DELAY);
			}
			if (health.hp > state.displayed) {
				state.displayed = health.hp;
			}
			state.lastHp = health.hp;
			state.visible.tick(dtSeconds);

			if (!state.delay.done()) {
				state.delay.tick(dtSeconds);
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
