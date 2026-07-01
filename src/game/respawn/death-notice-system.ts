import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { DeathNoticeComponent } from "../respawn/death-notice-component";

export class DeathNoticeSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		for (const [id, notice] of ecs.query(DeathNoticeComponent)) {
			notice.fade.tick(dt);
			if (notice.fade.done()) {
				ecs.destroyEntity(id);
			}
		}
	}
}
