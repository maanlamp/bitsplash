import type { Seconds } from "../../engine/duration";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { HitsplatComponent } from "./hitsplat-component";
import { HitsplatStyleComponent } from "./hitsplat-style-component";
import { profiler } from "../../engine/profiling/profiler";

const DEFAULT_GRAVITY = 500;

/** Hitsplats run on milliseconds `dt`, converted once per frame. */
@profiler("Hitsplats", "Combat")
export class HitsplatSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		const dtSeconds = (dt / 1000) as Seconds;
		const styleEntry = ecs.queryFirst(HitsplatStyleComponent);
		const gravity = styleEntry
			? styleEntry[1].gravity
			: DEFAULT_GRAVITY;
		for (const [id, hitsplat] of ecs.query(HitsplatComponent)) {
			hitsplat.velocity.y += gravity * dtSeconds;
			hitsplat.position.x += hitsplat.velocity.x * dtSeconds;
			hitsplat.position.y += hitsplat.velocity.y * dtSeconds;
			hitsplat.life.tick(dtSeconds);
			if (hitsplat.life.done()) {
				ecs.destroy(id);
			}
		}
	}
}
