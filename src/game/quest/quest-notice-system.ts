import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { profiler } from "../../engine/profiling/profiler";
import { QuestNoticeComponent } from "../quest/quest-notice-component";

@profiler("Quest notice", "Quest")
export class QuestNoticeSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		for (const [id, notice] of ecs.query(QuestNoticeComponent)) {
			notice.fade.tick(dt);
			if (notice.fade.done()) {
				ecs.destroy(id);
			}
		}
	}
}
