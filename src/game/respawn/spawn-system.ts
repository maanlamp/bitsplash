import type { EntityId } from "../../engine/ecs";
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
	private consumed = new Set<EntityId>();
	private seeded = false;

	resetRuntime(): void {
		this.consumed.clear();
		this.seeded = false;
	}

	update({ ecs, world, events }: UpdateContext): void {
		this.spawnOnLoadPoints(ecs, world);
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
				respawn.spawnPoint.set(event.spawnPoint);
			}
		}
	}

	private spawnOnLoadPoints(
		ecs: UpdateContext["ecs"],
		world: UpdateContext["world"],
	): void {
		if (!this.seeded) {
			for (const [pointId, point] of ecs.query(SpawnPointComponent)) {
				if (point.spawnOnLoad) {
					this.consumed.add(pointId);
				}
			}
			this.seeded = true;
			return;
		}
		for (const [pointId, point, transform] of ecs.query(
			SpawnPointComponent,
			TransformComponent,
		)) {
			if (!point.spawnOnLoad || this.consumed.has(pointId)) {
				continue;
			}
			this.consumed.add(pointId);
			const spawned = spawnPrefab(
				world,
				point.prefab,
				transform.position,
			);
			if (spawned === null) {
				continue;
			}
			const respawn = ecs.getComponent(spawned, RespawnComponent);
			if (respawn) {
				respawn.spawnPoint.set(pointId);
			}
		}
	}
}
