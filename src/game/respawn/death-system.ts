import { CameraShakeComponent } from "../../engine/components/camera-shake";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { scheduleEvent } from "../../engine/systems/timer";
import { DeathNoticeComponent } from "../respawn/death-notice-component";
import PlayerTagComponent from "../player/player-tag-component";
import { RespawnComponent } from "../respawn/respawn-component";
import { DeathEvent, SpawnEvent } from "../events";

export class DeathSystem implements UpdateSystem {
	update({ ecs, world, events }: UpdateContext): void {
		for (const event of events.read(DeathEvent)) {
			const entity = event.entity;
			const respawn = ecs.getComponent(entity, RespawnComponent);
			if (respawn && respawn.spawnPoint) {
				scheduleEvent(
					ecs,
					respawn.delay,
					new SpawnEvent(respawn.spawnPoint, entity),
				);
			}
			if (ecs.getComponent(entity, PlayerTagComponent)) {
				ecs.createEntity([new DeathNoticeComponent()]);
				const shake = ecs.query(CameraShakeComponent)[0];
				if (shake) {
					shake[1].trauma = 1;
				}
			}
			world.scheduleDespawn(entity);
		}
	}
}
