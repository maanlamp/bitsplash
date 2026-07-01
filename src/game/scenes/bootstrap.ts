import type { Bounds } from "../../engine/camera/camera-2d";
import { InkStoryComponent } from "../../engine/ink/ink-story-component";
import { TransformComponent } from "../../engine/transform-component";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import type { TileGrid } from "../../engine/tilemap/grid";
import Vector2 from "../../engine/vector2";
import type { World } from "../../engine/world";
import { InteractionStateComponent } from "../interaction/interaction-state-component";
import { PlayerInputComponent } from "../player/player-input-component";
import { RespawnComponent } from "../respawn/respawn-component";
import { SpawnPointComponent } from "../respawn/spawn-point-component";
import { spawnBow } from "../combat/spawn-bow";
import { spawnCamera2D } from "../spawn-camera-2d";
import { spawnPrefab } from "../prefabs";

// Ensure these are bundled, important for loading
import.meta.glob(
	["../../engine/**/*-component.ts", "../*/*-component.ts"],
	{ eager: true },
);

const levelBounds = (tileGrid: TileGrid): Bounds | null => {
	const gb = tileGrid.bounds();
	if (!gb) {
		return null;
	}
	return {
		min: new Vector2(gb.minX * TILE_SIZE, gb.minY * TILE_SIZE),
		max: new Vector2(
			(gb.maxX + 1) * TILE_SIZE,
			(gb.maxY + 1) * TILE_SIZE,
		),
	};
};

const spawnInitialEntities = (world: World): void => {
	for (const [pointId, point, transform] of world.ecs.query(
		SpawnPointComponent,
		TransformComponent,
	)) {
		if (!point.spawnOnLoad) {
			continue;
		}
		const spawned = spawnPrefab(
			world,
			point.prefab,
			transform.position,
		);
		if (spawned === null) {
			continue;
		}
		const respawn = world.ecs.getComponent(spawned, RespawnComponent);
		if (respawn) {
			respawn.spawnPoint = pointId;
		}
	}
};

export const spawnRuntimeEntities = (
	deps: Readonly<{ tileGrid: TileGrid; world: World }>,
): void => {
	spawnInitialEntities(deps.world);
	const player = deps.world.ecs.query(PlayerInputComponent)[0];
	if (player) {
		spawnCamera2D(deps.world, {
			target: player[0],
			bounds: levelBounds(deps.tileGrid),
		});
		spawnBow(deps.world, { owner: player[0] });
	}
	deps.world.ecs.createEntity([new InteractionStateComponent()]);
	deps.world.ecs.createEntity([new InkStoryComponent()]);
};
