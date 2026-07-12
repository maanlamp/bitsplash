import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import type { EntityId } from "../src/engine/ecs";
import { PhysicsBodyComponent } from "../src/engine/physics/physics-body-component";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import {
	Runtime,
	type SceneDefinition,
} from "../src/engine/runtime/runtime";
import {
	decodeEnvelope,
	encodeEnvelope,
	type Envelope,
	SAVE_VERSION,
} from "../src/engine/save/save-envelope";
import { InMemorySaveStore } from "../src/engine/save/in-memory-save-store";
import { SaveManager } from "../src/engine/save/save-manager";
import { PersistentComponent } from "../src/engine/scene/persistent-component";
import { SceneConfig } from "../src/engine/scene/scene";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";
import { HealthComponent } from "../src/game/health/health-component";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

const config = (gravityY: number): SceneConfig => {
	const c = new SceneConfig();
	c.gravity = new Vector2(0, gravityY);
	return c;
};

const PLAYER_ID = "11111111-1111-4111-8111-111111111111" as EntityId;
const ENEMY_ID = "22222222-2222-4222-8222-222222222222" as EntityId;
const SCENE_B_ID = "33333333-3333-4333-8333-333333333333" as EntityId;

const seed = (world: World): void => {
	world.ecs.createEntity(
		[
			new PersistentComponent(),
			new TransformComponent(new Vector2(0, 0)),
			new HealthComponent(100, 100),
			new PhysicsBodyComponent("dynamic"),
		],
		PLAYER_ID,
	);
};

const scenes: Record<string, SceneDefinition> = {
	A: {
		config: config(20),
		build: (world) => {
			world.ecs.createEntity(
				[
					new TransformComponent(new Vector2(50, 0)),
					new HealthComponent(30, 30),
					new PhysicsBodyComponent("dynamic"),
				],
				ENEMY_ID,
			);
		},
	},
	B: {
		config: config(5),
		build: (world) => {
			world.ecs.createEntity(
				[
					new TransformComponent(new Vector2(-20, 0)),
					new HealthComponent(10, 10),
				],
				SCENE_B_ID,
			);
		},
	},
};

const resolveScene = (id: string): SceneDefinition => {
	const def = scenes[id];
	if (!def) {
		throw new Error(`unknown scene: ${id}`);
	}
	return def;
};

const buildRuntime = (): Runtime =>
	new Runtime({
		world: new World({ x: 0, y: 20 }),
		seed,
		resolveScene,
	});

test("gzip round-trip through the save store preserves persistent state, active scene, and frozen scenes", async () => {
	const source = buildRuntime();
	source.newGame("A");
	source.world.ecs.getComponent(PLAYER_ID, HealthComponent)!.hp = 42;
	source.goToScene("B");

	const store = new InMemorySaveStore();
	const manager = new SaveManager();

	await store.write("slot-1", await manager.capture(source, 12_345));
	source.dispose();

	const blob = await store.read("slot-1");
	expect(blob).toBeDefined();

	const target = buildRuntime();
	const envelope = await manager.restore(target, blob!);

	expect(envelope.version).toBe(SAVE_VERSION);
	expect(envelope.savedAt).toBe(12_345);

	// Persistent state survived the gzip round-trip into a fresh Runtime.
	expect(
		target.world.ecs.getComponent(PLAYER_ID, PersistentComponent),
	).toBeInstanceOf(PersistentComponent);
	expect(
		target.world.ecs.getComponent(PLAYER_ID, HealthComponent)!.hp,
	).toBe(42);

	// Active scene is B, with B's content and config restored live.
	expect(target.activeScene).toBe("B");
	expect(target.config!.gravity.y).toBe(5);
	expect(
		target.world.ecs.getComponent(SCENE_B_ID, HealthComponent)!.hp,
	).toBe(10);

	// Scene A survived as a frozen snapshot (its enemy, not the player).
	const frozenA = target.frozenScene("A");
	expect(frozenA).toBeDefined();
	expect(frozenA!.map((e) => e.id)).toContain(ENEMY_ID);
	expect(frozenA!.map((e) => e.id)).not.toContain(PLAYER_ID);

	target.dispose();
});

test("an older envelope version passes through migrate (identity) and restores", async () => {
	const source = buildRuntime();
	source.newGame("A");
	source.world.ecs.getComponent(PLAYER_ID, HealthComponent)!.hp = 7;
	source.goToScene("B");

	const manager = new SaveManager();
	const current = (await decodeEnvelope(
		await manager.capture(source, 999),
	)) as Envelope;
	source.dispose();

	// Author a blob carrying an older schema version (same shape → identity upcast).
	const legacy = await encodeEnvelope({
		...current,
		version: SAVE_VERSION - 1,
	});

	const target = buildRuntime();
	const envelope = await manager.restore(target, legacy);

	// migrate() bumped it forward to the current version.
	expect(envelope.version).toBe(SAVE_VERSION);

	expect(target.activeScene).toBe("B");
	expect(
		target.world.ecs.getComponent(PLAYER_ID, HealthComponent)!.hp,
	).toBe(7);
	expect(
		target.world.ecs.getComponent(SCENE_B_ID, HealthComponent)!.hp,
	).toBe(10);

	target.dispose();
});
