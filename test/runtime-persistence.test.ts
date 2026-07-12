import { expect, spyOn, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import type { EntityId } from "../src/engine/ecs";
import { PhysicsBodyComponent } from "../src/engine/physics/physics-body-component";
import { PhysicsSystem } from "../src/engine/physics/physics-system";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import {
	Runtime,
	type SceneDefinition,
} from "../src/engine/runtime/runtime";
import { PersistentComponent } from "../src/engine/scene/persistent-component";
import { SceneConfig } from "../src/engine/scene/scene";
import type { UpdateContext } from "../src/engine/system";
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

// The persistent entity id is fixed so the seed spawns exactly one durable
// entity (a stand-in for the player) carrying a mutable flag (health.hp) and a
// Rapier body. Scene A spawns one scene-content "enemy" with its own body.
const PLAYER_ID = "11111111-1111-4111-8111-111111111111" as EntityId;
const ENEMY_ID = "22222222-2222-4222-8222-222222222222" as EntityId;

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

const sceneA: SceneDefinition = {
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
};

const sceneB: SceneDefinition = {
	config: config(5),
	build: (world) => {
		world.ecs.createEntity([
			new TransformComponent(new Vector2(-20, 0)),
			new HealthComponent(10, 10),
		]);
	},
};

const scenes: Record<string, SceneDefinition> = {
	A: sceneA,
	B: sceneB,
};

const backendOf = (world: World) =>
	(
		world as unknown as {
			physics: { destroyBody: (body: unknown) => void };
		}
	).physics;

const materializeBodies = (world: World): void => {
	const physics = new PhysicsSystem();
	physics.update({
		dt: 16,
		ecs: world.ecs,
		world,
	} as unknown as UpdateContext);
};

test("goToScene freezes/despawns scene content while persistent state survives, then thaws faithfully", () => {
	const world = new World({ x: 0, y: 20 });
	const runtime = new Runtime({
		world,
		seed,
		resolveScene: (id) => {
			const def = scenes[id];
			if (!def) {
				throw new Error(`unknown scene: ${id}`);
			}
			return def;
		},
	});

	runtime.newGame("A");

	// Materialize Rapier bodies the way PhysicsSystem does at runtime.
	materializeBodies(world);
	const playerPhys = world.ecs.getComponent(
		PLAYER_ID,
		PhysicsBodyComponent,
	)!;
	const enemyPhys = world.ecs.getComponent(
		ENEMY_ID,
		PhysicsBodyComponent,
	)!;
	expect(playerPhys.body).not.toBeNull();
	expect(enemyPhys.body).not.toBeNull();

	// Set a flag/state on the persistent entity.
	const playerHealth = world.ecs.getComponent(
		PLAYER_ID,
		HealthComponent,
	)!;
	playerHealth.hp = 42;

	const destroySpy = spyOn(backendOf(world), "destroyBody");

	runtime.goToScene("B");

	// Persistent entity + its flag survived the transition.
	const survivedPlayer = world.ecs.getComponent(
		PLAYER_ID,
		PersistentComponent,
	);
	expect(survivedPlayer).toBeInstanceOf(PersistentComponent);
	expect(world.ecs.getComponent(PLAYER_ID, HealthComponent)!.hp).toBe(
		42,
	);

	// Scene-A content is gone from the live world...
	expect(
		world.ecs.getComponent(ENEMY_ID, HealthComponent),
	).toBeUndefined();
	expect(world.ecs.entities()).not.toContain(ENEMY_ID);

	// ...but present in the frozen store (and the persistent entity is NOT frozen).
	const frozenA = runtime.frozenScene("A");
	expect(frozenA).toBeDefined();
	expect(frozenA!.map((e) => e.id)).toContain(ENEMY_ID);
	expect(frozenA!.map((e) => e.id)).not.toContain(PLAYER_ID);

	// The persistent Rapier body persists; only the scene-content body was freed.
	expect(destroySpy).toHaveBeenCalledTimes(1);
	expect(playerPhys.body).not.toBeNull();

	// Scene B's own content is live; gravity was swapped to B's config.
	expect(runtime.activeScene).toBe("B");
	expect(runtime.config!.gravity.y).toBe(5);

	// Back to A: the frozen scene-A state is restored faithfully. The enemy that
	// was alive when we left A is back, with its state intact.
	runtime.goToScene("A");
	expect(runtime.activeScene).toBe("A");
	const restoredEnemy = world.ecs.getComponent(
		ENEMY_ID,
		HealthComponent,
	);
	expect(restoredEnemy).toBeInstanceOf(HealthComponent);
	expect(restoredEnemy!.hp).toBe(30);
	// Persistent state still carries across the second transition.
	expect(world.ecs.getComponent(PLAYER_ID, HealthComponent)!.hp).toBe(
		42,
	);
	// Scene-B content is gone from the live world and frozen for B.
	expect(runtime.frozenScene("B")).toBeDefined();

	// The restored enemy has no live body until systems rebuild it (Kind-3
	// recompute-on-load); the persistent body was never torn down.
	expect(
		world.ecs.getComponent(ENEMY_ID, PhysicsBodyComponent)!.body,
	).toBeNull();
	materializeBodies(world);
	expect(
		world.ecs.getComponent(ENEMY_ID, PhysicsBodyComponent)!.body,
	).not.toBeNull();

	runtime.dispose();
});

test("newGame refuses to re-seed the persistent set", () => {
	const world = new World({ x: 0, y: 20 });
	const runtime = new Runtime({
		world,
		seed,
		resolveScene: (id) => scenes[id]!,
	});
	runtime.newGame("A");
	expect(() => runtime.newGame("A")).toThrow(/already seeded/);
	runtime.dispose();
});
