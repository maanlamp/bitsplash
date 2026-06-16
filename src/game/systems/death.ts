import { CameraShakeComponent } from "../../engine/components/camera-shake";
import { TagsComponent } from "../../engine/components/tags";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { scheduleEvent } from "../../engine/systems/timer";
import { DeathNoticeComponent } from "../components/death-notice";
import { PlayerInputComponent } from "../components/player-input";
import { RespawnComponent } from "../components/respawn";
import { DeathEvent, KillEvent, SpawnEvent } from "../events";

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
			if (ecs.getComponent(entity, PlayerInputComponent)) {
				ecs.createEntity([new DeathNoticeComponent()]);
				const shake = ecs.query(CameraShakeComponent)[0];
				if (shake) {
					shake[1].trauma = 1;
				}
			}
			const tags = ecs.getComponent(entity, TagsComponent);
			events.emit(new KillEvent(entity, tags ? [...tags.tags] : []));
			world.despawn(entity);
		}
	}
}
