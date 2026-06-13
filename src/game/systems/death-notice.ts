import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { DeathNoticeComponent } from "../components/death-notice";

export class DeathNoticeSystem implements UpdateSystem {
	update({ time, ecs }: UpdateContext): void {
		for (const [id, notice] of ecs.query(DeathNoticeComponent)) {
			notice.remaining -= time.dt;
			if (notice.remaining <= 0) {
				ecs.destroyEntity(id);
			}
		}
	}
}
