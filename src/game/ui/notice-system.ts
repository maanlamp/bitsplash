import type { Seconds } from "../../engine/duration";
import { profiler } from "../../engine/profiling/profiler";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { NoticeComponent } from "./notice-component";

/**
 * Runs every HUD notice's clock and retires it when the envelope is spent.
 *
 * One system for every slot: a notice is a notice whatever spawned it, and the
 * only thing that differs is data on the component.
 */
@profiler("Notice", "HUD")
export class NoticeSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		for (const [id, notice] of ecs.query(NoticeComponent)) {
			notice.timeline.tick((dt / 1000) as Seconds);
			if (notice.timeline.done()) {
				ecs.destroy(id);
			}
		}
	}
}
