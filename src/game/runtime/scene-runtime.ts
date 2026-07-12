import type { Bounds } from "../../engine/camera/camera-2d";
import { Camera2DFollowComponent } from "../../engine/camera/camera-2d-follow-component";
import type { EntityId } from "../../engine/ecs";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import type { SceneDefinition } from "../../engine/runtime/runtime";
import type { SceneConfig } from "../../engine/scene/scene";
import { deserializeWorld } from "../../engine/serialization/deserialize";
import type { SerializedWorld } from "../../engine/serialization/registry";
import { TransformComponent } from "../../engine/transform-component";
import type { World } from "../../engine/world";
import { PlayerInputComponent } from "../player/player-input-component";
import { spawnPrefab } from "../prefabs";
import { RespawnComponent } from "../respawn/respawn-component";
import { SpawnPointComponent } from "../respawn/spawn-point-component";
import { spawnCamera2D } from "../spawn-camera-2d";

const PLAYER_PREFAB = "player";

export type AuthoredScene = Readonly<{
	config: SceneConfig;
	entities: SerializedWorld;
	bounds?: Bounds | null;
}>;

const playerEntity = (world: World): EntityId | null =>
	world.ecs.query(PlayerInputComponent)[0]?.[0] ?? null;

const playerSpawnPoint = (world: World): EntityId | null => {
	for (const [id, point] of world.ecs.query(SpawnPointComponent)) {
		if (point.prefab === PLAYER_PREFAB) {
			return id;
		}
	}
	return null;
};

const buildSceneContent = (
	world: World,
	entities: SerializedWorld,
): void => {
	deserializeWorld(world, entities, "scene content");
	for (const [pointId, point, transform] of world.ecs.query(
		SpawnPointComponent,
		TransformComponent,
	)) {
		if (!point.spawnOnLoad || point.prefab === PLAYER_PREFAB) {
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
		world.ecs
			.getComponent(spawned, RespawnComponent)
			?.spawnPoint.set(pointId);
	}
};

const repositionPlayer = (world: World): void => {
	const player = playerEntity(world);
	const spawnId = playerSpawnPoint(world);
	if (player === null || spawnId === null) {
		return;
	}
	const spawnTransform = world.ecs.getComponent(
		spawnId,
		TransformComponent,
	);
	const playerTransform = world.ecs.getComponent(
		player,
		TransformComponent,
	);
	if (spawnTransform && playerTransform) {
		playerTransform.position.set(
			spawnTransform.position.x,
			spawnTransform.position.y,
		);
		const phys = world.ecs.getComponent(player, PhysicsBodyComponent);
		if (phys?.body) {
			phys.body.setTransform(
				spawnTransform.position,
				playerTransform.rotation.radians,
			);
			phys.velocity.set(0, 0);
		}
	}
	world.ecs
		.getComponent(player, RespawnComponent)
		?.spawnPoint.set(spawnId);
};

const setupCamera = (world: World, bounds: Bounds | null): void => {
	const player = playerEntity(world);
	if (player === null) {
		return;
	}
	const existing = world.ecs.query(Camera2DFollowComponent)[0];
	if (existing) {
		existing[1].targets = [player];
		existing[1].bounds = bounds;
		return;
	}
	spawnCamera2D(world, { target: player, bounds });
};

export const toSceneDefinition = (
	authored: AuthoredScene,
): SceneDefinition => ({
	config: authored.config,
	build: (world) => buildSceneContent(world, authored.entities),
	onEnter: (world) => {
		repositionPlayer(world);
		setupCamera(world, authored.bounds ?? null);
	},
});
