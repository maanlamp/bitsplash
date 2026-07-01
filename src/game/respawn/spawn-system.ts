import { TransformComponent } from "../../engine/transform-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { RespawnComponent } from "../respawn/respawn-component";
import { SpawnPointComponent } from "../respawn/spawn-point-component";
import { SpawnEvent } from "../events";
import { spawnPrefab } from "../prefabs";

export class SpawnSystem implements UpdateSystem {
	update({ ecs, world, events }: UpdateContext): void {
		for (const event of events.read(SpawnEvent)) {
			const point = ecs.getComponent(
				event.spawnPoint,
				SpawnPointComponent,
			);
			const transform = ecs.getComponent(
				event.spawnPoint,
				TransformComponent,
			);
			if (!point || !transform) {
				continue;
			}
			const spawned = spawnPrefab(
				world,
				point.prefab,
				transform.position,
				event.id,
			);
			if (spawned === null) {
				continue;
			}
			const respawn = ecs.getComponent(spawned, RespawnComponent);
			if (respawn) {
				respawn.spawnPoint = event.spawnPoint;
			}
		}
	}
}
