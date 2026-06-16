import type { Bounds } from "../../engine/camera-2d";
import { InkStoryComponent } from "../../engine/components/ink-story";
import { TransformComponent } from "../../engine/components/transform";
import { TILE_SIZE } from "../../engine/tile";
import type { TileGrid } from "../../engine/tilemap/grid";
import Vector2 from "../../engine/vector2";
import type { World } from "../../engine/world";
import { InteractionStateComponent } from "../components/interaction-state";
import { PlayerInputComponent } from "../components/player-input";
import { RespawnComponent } from "../components/respawn";
import { SpawnPointComponent } from "../components/spawn-point";
import { spawnBow } from "../entities/bow";
import { spawnCamera2D } from "../entities/camera-2d";
import { spawnPrefab } from "../prefabs";

// Ensure these are bundled, important for loading
import.meta.glob(
	["../../engine/components/*.ts", "../components/*.ts"],
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
