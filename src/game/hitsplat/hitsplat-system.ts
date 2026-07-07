import { TransformComponent } from "../../engine/transform-component";
import type { Seconds } from "../../engine/duration";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { HitsplatComponent } from "./hitsplat-component";
import { HitsplatStyleComponent } from "./hitsplat-style-component";

const DEFAULT_GRAVITY = 500;

export class HitsplatSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		const dtSeconds = (dt / 1000) as Seconds;
		const styleEntry = ecs.query(HitsplatStyleComponent)[0];
		const gravity = styleEntry
			? styleEntry[1].gravity
			: DEFAULT_GRAVITY;
		for (const [id, hitsplat, transform] of ecs.query(
			HitsplatComponent,
			TransformComponent,
		)) {
			hitsplat.velocity.y += gravity * dtSeconds;
			transform.position.x += hitsplat.velocity.x * dtSeconds;
			transform.position.y += hitsplat.velocity.y * dtSeconds;
			hitsplat.age = (hitsplat.age + dtSeconds) as Seconds;
			if (hitsplat.age >= hitsplat.lifetime) {
				ecs.destroy(id);
			}
		}
	}
}
