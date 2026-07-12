import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import type { EntityId } from "../src/engine/ecs";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { SceneConfig } from "../src/engine/scene/scene";
import { serializeWorld } from "../src/engine/serialization/serialize";
import type { SerializedWorld } from "../src/engine/serialization/registry";
import type { UpdateContext } from "../src/engine/system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
import {
	type PrefabDefinition,
	registerPrefab,
} from "../src/game/prefabs";
import { RespawnComponent } from "../src/game/respawn/respawn-component";
import { SpawnPointComponent } from "../src/game/respawn/spawn-point-component";
import { SpawnSystem } from "../src/game/respawn/spawn-system";
import { bootGame } from "../src/game/runtime/boot-game";
import type { AuthoredScene } from "../src/game/runtime/scene-runtime";
import playerPrefab from "../src/game/content/prefabs/player.json";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

registerPrefab("player", playerPrefab as unknown as PrefabDefinition);

const critterPrefab = (): PrefabDefinition => {
	const scratch = new World({ x: 0, y: 0 });
	const id = scratch.ecs.createEntity([
		new TransformComponent(new Vector2(0, 0)),
		new RespawnComponent(),
	]);
	const serialized = serializeWorld(scratch.ecs).find(
		(e) => e.id === id,
	)!;
	scratch.dispose();
	return { components: serialized.components };
};

registerPrefab("critter", critterPrefab());

const PLAYER_POINT_A =
	"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as EntityId;
const CRITTER_POINT_A =
	"cccccccc-cccc-4ccc-8ccc-cccccccccccc" as EntityId;
const PLAYER_POINT_B =
	"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as EntityId;
const CRITTER_POINT_B =
	"dddddddd-dddd-4ddd-8ddd-dddddddddddd" as EntityId;

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
	critterPoint: EntityId,
	critterAt: number,
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
		world.ecs.createEntity(
			[
				new TransformComponent(new Vector2(critterAt, 0)),
				new SpawnPointComponent("critter", true),
			],
			critterPoint,
		);
	}),
});

const scenes: Record<string, AuthoredScene> = {
	A: sceneWith(PLAYER_POINT_A, 10, CRITTER_POINT_A, 40),
	B: sceneWith(PLAYER_POINT_B, 500, CRITTER_POINT_B, 560),
};

const resolveScene = (id: string): AuthoredScene => {
	const scene = scenes[id];
	if (!scene) {
		throw new Error(`unknown scene: ${id}`);
	}
	return scene;
};

const ctx = (world: World): UpdateContext =>
	({
		dt: 16,
		ecs: world.ecs,
		world,
		events: world.events,
	}) as unknown as UpdateContext;

// A critter is any spawnOnLoad-spawned prefab (they carry Respawn) that is not
// the player — this counts spawned scene content without matching spawn points.
const critterCount = (world: World): number =>
	world.ecs
		.query(RespawnComponent)
		.filter(
			([id]) =>
				world.ecs.getComponent(id, PlayerInputComponent) ===
				undefined,
		).length;

test("spawnOnLoad content spawns exactly once per scene build and SpawnSystem never re-spawns it", () => {
	const runtime = bootGame({ initialScene: "A", resolveScene });
	const world = runtime.world;

	// build() (Runtime path) spawned the critter exactly once.
	expect(critterCount(world)).toBe(1);

	const spawn = new SpawnSystem();
	for (let i = 0; i < 5; i++) {
		spawn.update(ctx(world));
		world.ecs.flushDestroyed();
	}

	// Stepping SpawnSystem does not duplicate the build-spawned content.
	expect(critterCount(world)).toBe(1);

	runtime.dispose();
});

test("A -> B -> A transition does not accumulate duplicate scene content", () => {
	const runtime = bootGame({ initialScene: "A", resolveScene });
	const world = runtime.world;
	const spawn = new SpawnSystem();
	const step = (): void => {
		spawn.update(ctx(world));
		world.ecs.flushDestroyed();
	};

	step();
	expect(critterCount(world)).toBe(1);

	// Fail-before/pass-after: with the old frame-1-consume SpawnSystem, its
	// consumed/seeded state survived the transition, so build(B)'s critter was
	// re-spawned by the update loop here (count 2). build owns the spawn now.
	runtime.goToScene("B");
	step();
	expect(critterCount(world)).toBe(1);

	// Returning to A restores frozen content; nothing is spawned a second time.
	runtime.goToScene("A");
	step();
	step();
	expect(critterCount(world)).toBe(1);

	runtime.dispose();
});
