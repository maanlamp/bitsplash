import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { QuestNoticeComponent } from "../quest/quest-notice-component";

export class QuestNoticeSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		for (const [id, notice] of ecs.query(QuestNoticeComponent)) {
			notice.fade.tick(dt);
			if (notice.fade.done()) {
				ecs.destroyEntity(id);
			}
		}
	}
}
