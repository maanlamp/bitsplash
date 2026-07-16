import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { profiler } from "../../engine/profiling/profiler";
import { DeathNoticeComponent } from "../respawn/death-notice-component";

@profiler("Death notice", "Respawn")
export class DeathNoticeSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		for (const [id, notice] of ecs.query(DeathNoticeComponent)) {
			notice.fade.tick(dt);
			if (notice.fade.done()) {
				ecs.destroy(id);
			}
		}
	}
}
