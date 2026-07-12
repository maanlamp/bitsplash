import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import { Camera2DFollowComponent } from "../src/engine/camera/camera-2d-follow-component";
import type { EntityId } from "../src/engine/ecs";
import { InkStoryComponent } from "../src/engine/ink/ink-story-component";
import {
	compileStory,
	mirrorInkState,
} from "../src/engine/ink/story";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { PersistentComponent } from "../src/engine/scene/persistent-component";
import { SceneConfig } from "../src/engine/scene/scene";
import { serializeWorld } from "../src/engine/serialization/serialize";
import type { SerializedWorld } from "../src/engine/serialization/registry";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";
import { HealthComponent } from "../src/game/health/health-component";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
import {
	type PrefabDefinition,
	registerPrefab,
} from "../src/game/prefabs";
import { RespawnComponent } from "../src/game/respawn/respawn-component";
import { SpawnPointComponent } from "../src/game/respawn/spawn-point-component";
import { bootGame } from "../src/game/runtime/boot-game";
import type { AuthoredScene } from "../src/game/runtime/scene-runtime";
import playerPrefab from "../src/game/content/prefabs/player.json";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

registerPrefab("player", playerPrefab as unknown as PrefabDefinition);

const SPAWN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as EntityId;
const SPAWN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as EntityId;
const ENEMY_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as EntityId;

const config = (gravityY: number): SceneConfig => {
	const c = new SceneConfig();
	c.gravity = new Vector2(0, gravityY);
	return c;
};

// Authors scene content the way an authored .scene.json would carry it: a real
// SerializedWorld, built by populating a scratch world and serializing it.
const authored = (build: (world: World) => void): SerializedWorld => {
	const scratch = new World({ x: 0, y: 0 });
	build(scratch);
	const entities = serializeWorld(scratch.ecs);
	scratch.dispose();
	return entities;
};

const sceneA: AuthoredScene = {
	config: config(20),
	entities: authored((world) => {
		world.ecs.createEntity(
			[
				new TransformComponent(new Vector2(10, 0)),
				new SpawnPointComponent("player", true),
			],
			SPAWN_A,
		);
		world.ecs.createEntity(
			[
				new TransformComponent(new Vector2(60, 0)),
				new HealthComponent(30, 30),
			],
			ENEMY_A,
		);
	}),
};

const sceneB: AuthoredScene = {
	config: config(5),
	entities: authored((world) => {
		world.ecs.createEntity(
			[
				new TransformComponent(new Vector2(500, 0)),
				new SpawnPointComponent("player", true),
			],
			SPAWN_B,
		);
	}),
};

const scenes: Record<string, AuthoredScene> = {
	A: sceneA,
	B: sceneB,
};

const resolveScene = (id: string): AuthoredScene => {
	const scene = scenes[id];
	if (!scene) {
		throw new Error(`unknown scene: ${id}`);
	}
	return scene;
};

const MINI_INK = 'VAR worldview = "unknown"\nHello.\n-> END\n';

test("real game boots through the Runtime: persistent player, scene transitions, and Ink survive", () => {
	const runtime = bootGame({ initialScene: "A", resolveScene });

	const world = runtime.world;
	const playerQuery = world.ecs.query(PlayerInputComponent);
	expect(playerQuery.length).toBe(1);
	const playerId = playerQuery[0]![0];

	// The seeded player is persistent and positioned at scene A's spawn.
	expect(
		world.ecs.getComponent(playerId, PersistentComponent),
	).toBeInstanceOf(PersistentComponent);
	const playerTransform = world.ecs.getComponent(
		playerId,
		TransformComponent,
	)!;
	expect(playerTransform.position.x).toBe(10);

	// The camera targets the persistent player by id, and its spawn was re-linked.
	const cameraA = world.ecs.query(Camera2DFollowComponent);
	expect(cameraA.length).toBe(1);
	expect(cameraA[0]![1].targets).toContain(playerId);
	expect(
		world.ecs.getComponent(playerId, RespawnComponent)!.spawnPoint.id,
	).toBe(SPAWN_A);

	// The Ink singleton is persistent and seeded exactly once.
	const inkQuery = world.ecs.query(InkStoryComponent);
	expect(inkQuery.length).toBe(1);
	const inkComponent = inkQuery[0]![1];
	expect(
		world.ecs.getComponent(inkQuery[0]![0], PersistentComponent),
	).toBeInstanceOf(PersistentComponent);

	// Drive a real Ink variable, then mutate scene-A content.
	inkComponent.story = compileStory(
		{ "main.ink": MINI_INK },
		"main.ink",
	);
	inkComponent.story.variablesState["worldview"] = "thief";
	world.ecs.getComponent(ENEMY_A, HealthComponent)!.hp = 5;

	runtime.goToScene("B");

	// Persistent player and its live Ink state survived the transition...
	expect(world.ecs.query(PlayerInputComponent).length).toBe(1);
	expect(world.ecs.query(PlayerInputComponent)[0]![0]).toBe(playerId);
	expect(inkComponent.story!.variablesState["worldview"]).toBe(
		"thief",
	);

	// ...and the player was repositioned to scene B's spawn + re-linked.
	expect(
		world.ecs.getComponent(playerId, TransformComponent)!.position.x,
	).toBe(500);
	expect(
		world.ecs.getComponent(playerId, RespawnComponent)!.spawnPoint.id,
	).toBe(SPAWN_B);

	// The camera re-acquired the (never-despawned) player by id.
	const cameraB = world.ecs.query(Camera2DFollowComponent);
	expect(cameraB.length).toBe(1);
	expect(cameraB[0]![1].targets).toContain(playerId);

	// Scene-A content is frozen (with its mutated state) and gone from the world.
	expect(
		world.ecs.getComponent(ENEMY_A, HealthComponent),
	).toBeUndefined();
	const frozenA = runtime.frozenScene("A");
	expect(frozenA).toBeDefined();
	expect(frozenA!.map((e) => e.id)).toContain(ENEMY_A);
	expect(frozenA!.map((e) => e.id)).not.toContain(playerId);

	runtime.goToScene("A");

	// Frozen scene-A state restored faithfully (enemy back, hp preserved).
	const restoredEnemy = world.ecs.getComponent(
		ENEMY_A,
		HealthComponent,
	);
	expect(restoredEnemy).toBeInstanceOf(HealthComponent);
	expect(restoredEnemy!.hp).toBe(5);

	// Player repositioned back to scene A's spawn; Ink still intact.
	expect(
		world.ecs.getComponent(playerId, TransformComponent)!.position.x,
	).toBe(10);
	expect(inkComponent.story!.variablesState["worldview"]).toBe(
		"thief",
	);
	expect(world.ecs.query(Camera2DFollowComponent).length).toBe(1);

	runtime.dispose();
});

test("mirrorInkState projects live Ink state into the serializable field", () => {
	const component = new InkStoryComponent();
	expect(component.state).toBe("");

	component.story = compileStory(
		{ "main.ink": MINI_INK },
		"main.ink",
	);
	component.story.variablesState["worldview"] = "murderer";

	mirrorInkState(component);
	expect(component.state.length).toBeGreaterThan(0);

	// The mirrored JSON restores the variable into a fresh story.
	const reloaded = compileStory({ "main.ink": MINI_INK }, "main.ink");
	reloaded.state.LoadJson(component.state);
	expect(reloaded.variablesState["worldview"]).toBe("murderer");
});
