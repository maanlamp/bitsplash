import { CameraShakeComponent } from "../../engine/camera/camera-shake-component";
import type { Seconds } from "../../engine/duration";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { scheduleEvent } from "../../engine/timer/timer-system";
import { PlayerTagComponent } from "../player/player-tag-component";
import { RespawnComponent } from "../respawn/respawn-component";
import { DEATH_OVERLAY_ID } from "../ui/hud-ids";
import { NoticeComponent } from "../ui/notice-component";
import { profiler } from "../../engine/profiling/profiler";
import { DeathEvent, SpawnEvent } from "../events";

const NOTICE_FADE_IN = 0.3;
const NOTICE_HOLD = 1.5;
const NOTICE_FADE_OUT = 0.7;

@profiler("Death", "Respawn")
export class DeathSystem implements UpdateSystem {
	update({ ecs, events }: UpdateContext): void {
		for (const event of events.read(DeathEvent)) {
			const entity = event.entity;
			const respawn = ecs.getComponent(entity, RespawnComponent);
			if (respawn && respawn.spawnPoint.id) {
				scheduleEvent(
					ecs,
					respawn.delay.seconds as Seconds,
					new SpawnEvent(respawn.spawnPoint.id, entity),
				);
			}
			if (ecs.getComponent(entity, PlayerTagComponent)) {
				ecs.createEntity([
					new NoticeComponent(
						DEATH_OVERLAY_ID,
						"",
						NOTICE_FADE_IN,
						NOTICE_HOLD,
						NOTICE_FADE_OUT,
					),
				]);
				const shake = ecs.queryFirst(CameraShakeComponent);
				if (shake) {
					shake[1].trauma = 1;
				}
			}
			ecs.destroy(entity);
		}
	}
}
