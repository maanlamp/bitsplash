import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import type { EntityId } from "../src/engine/ecs";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { PersistentComponent } from "../src/engine/scene/persistent-component";
import { SceneConfig } from "../src/engine/scene/scene";
import { serializeWorld } from "../src/engine/serialization/serialize";
import type { SerializedWorld } from "../src/engine/serialization/registry";
import type { UpdateContext } from "../src/engine/system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";
import { ArrowComponent } from "../src/game/combat/arrow-component";
import { BowComponent } from "../src/game/combat/bow-component";
import { BowSystem } from "../src/game/combat/bow-system";
import { DamageStatsComponent } from "../src/game/combat/damage-stats-component";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
import {
	type PrefabDefinition,
	registerPrefab,
} from "../src/game/prefabs";
import { SpawnPointComponent } from "../src/game/respawn/spawn-point-component";
import { bootGame } from "../src/game/runtime/boot-game";
import type { AuthoredScene } from "../src/game/runtime/scene-runtime";
import playerPrefab from "../src/game/content/prefabs/player.json";
import arrowPrefab from "../src/game/content/prefabs/arrow.json";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

registerPrefab("player", playerPrefab as unknown as PrefabDefinition);
registerPrefab("arrow", arrowPrefab as unknown as PrefabDefinition);

const PLAYER_POINT_A =
	"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as EntityId;
const PLAYER_POINT_B =
	"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as EntityId;

const config = (): SceneConfig => {
	const c = new SceneConfig();
	c.gravity = new Vector2(0, 20);
	return c;
};

const authored = (build: (world: World) => void): SerializedWorld => {
	const scratch = new World({ x: 0, y: 0 });
	build(scratch);
	const entities = serializeWorld(scratch.ecs);
	scratch.dispose();
	return entities;
};

const sceneWith = (
	playerPoint: EntityId,
	playerAt: number,
): AuthoredScene => ({
	config: config(),
	entities: authored((world) => {
		world.ecs.createEntity(
			[
				new TransformComponent(new Vector2(playerAt, 0)),
				new SpawnPointComponent("player", true),
			],
			playerPoint,
		);
	}),
});

const scenes: Record<string, AuthoredScene> = {
	A: sceneWith(PLAYER_POINT_A, 10),
	B: sceneWith(PLAYER_POINT_B, 500),
};

const resolveScene = (id: string): AuthoredScene => {
	const scene = scenes[id];
	if (!scene) {
		throw new Error(`unknown scene: ${id}`);
	}
	return scene;
};

const playerId = (world: World): EntityId =>
	world.ecs.query(PlayerInputComponent)[0]![0];

const fireCtx = (world: World, left: boolean): UpdateContext =>
	({
		dt: 16,
		ecs: world.ecs,
		world,
		events: world.events,
		input: {
			mouse: {
				position: new Vector2(400, 300),
				buttons: { left },
			},
			keyboard: { keys: {} },
		},
	}) as unknown as UpdateContext;

test("the bow is a persistent component on the player that survives a scene transition and still fires", () => {
	const runtime = bootGame({ initialScene: "A", resolveScene });
	const world = runtime.world;

	// The bow now lives on the player entity (no separate bow entity) and the
	// player is persistent.
	const player = playerId(world);
	expect(world.ecs.getComponent(player, BowComponent)).toBeInstanceOf(
		BowComponent,
	);
	expect(
		world.ecs.getComponent(player, DamageStatsComponent),
	).toBeInstanceOf(DamageStatsComponent);
	expect(
		world.ecs.getComponent(player, PersistentComponent),
	).toBeInstanceOf(PersistentComponent);
	// No bow lives on a non-player entity.
	const bowHolders = world.ecs.query(BowComponent).map(([id]) => id);
	expect(bowHolders).toEqual([player]);

	runtime.goToScene("B");

	// The persistent player kept its identity and its bow across the
	// transition (fixes M-P1-6: abilities lost on scene change).
	expect(playerId(world)).toBe(player);
	expect(world.ecs.getComponent(player, BowComponent)).toBeInstanceOf(
		BowComponent,
	);
	expect(world.ecs.query(BowComponent).map(([id]) => id)).toEqual([
		player,
	]);

	// Firing still spawns an arrow with the bow on the player.
	const bow = new BowSystem();
	expect(world.ecs.query(ArrowComponent).length).toBe(0);
	bow.update(fireCtx(world, false));
	bow.update(fireCtx(world, true));
	world.ecs.flushDestroyed();
	expect(world.ecs.query(ArrowComponent).length).toBe(1);

	runtime.dispose();
});
