import { CameraShakeComponent } from "../../engine/camera/camera-shake-component";
import type { Seconds } from "../../engine/duration";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { scheduleEvent } from "../../engine/timer/timer-system";
import { DeathNoticeComponent } from "../respawn/death-notice-component";
import { PlayerTagComponent } from "../player/player-tag-component";
import { RespawnComponent } from "../respawn/respawn-component";
import { profiler } from "../../engine/profiling/profiler";
import { DeathEvent, SpawnEvent } from "../events";

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
				ecs.createEntity([new DeathNoticeComponent()]);
				const shake = ecs.query(CameraShakeComponent)[0];
				if (shake) {
					shake[1].trauma = 1;
				}
			}
			ecs.destroy(entity);
		}
	}
}
