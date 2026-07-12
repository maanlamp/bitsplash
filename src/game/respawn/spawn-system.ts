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
			const spawnPointId = event.spawnPoint.id;
			if (!spawnPointId) {
				continue;
			}
			const point = ecs.getComponent(
				spawnPointId,
				SpawnPointComponent,
			);
			const transform = ecs.getComponent(
				spawnPointId,
				TransformComponent,
			);
			if (!point || !transform) {
				continue;
			}
			const spawned = spawnPrefab(
				world,
				point.prefab,
				transform.position,
				event.id.id ?? undefined,
			);
			if (spawned === null) {
				continue;
			}
			const respawn = ecs.getComponent(spawned, RespawnComponent);
			if (respawn) {
				respawn.spawnPoint.set(spawnPointId);
			}
		}
	}
}
