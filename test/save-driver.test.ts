import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import { CutsceneComponent } from "../src/engine/cutscene/cutscene-component";
import type { EntityId } from "../src/engine/ecs";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import {
	Runtime,
	type SceneDefinition,
} from "../src/engine/runtime/runtime";
import { SaveDriver } from "../src/engine/save/save-driver";
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

const PLAYER_ID = "11111111-1111-4111-8111-111111111111" as EntityId;
const ENEMY_ID = "22222222-2222-4222-8222-222222222222" as EntityId;

const config = (gravityY: number): SceneConfig => {
	const c = new SceneConfig();
	c.gravity = new Vector2(0, gravityY);
	return c;
};

const seed = (world: World): void => {
	world.ecs.createEntity(
		[
			new PersistentComponent(),
			new TransformComponent(new Vector2(0, 0)),
			new HealthComponent(100, 100),
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
				],
				ENEMY_ID,
			);
		},
	},
	B: {
		config: config(5),
		build: () => {},
	},
};

const resolveScene = (id: string): SceneDefinition => {
	const def = scenes[id];
	if (!def) {
		throw new Error(`unknown scene: ${id}`);
	}
	return def;
};

const makeRuntime = (): Runtime =>
	new Runtime({
		world: new World({ x: 0, y: 20 }),
		seed,
		resolveScene,
	});

type Harness = Readonly<{
	driver: SaveDriver;
	store: InMemorySaveStore;
	clock: { value: number };
}>;

const harness = (intervalMs = 1000): Harness => {
	const store = new InMemorySaveStore();
	const clock = { value: 1000 };
	const runtime = makeRuntime();
	runtime.newGame("A");
	const driver = new SaveDriver({
		runtime,
		manager: new SaveManager(),
		store,
		createRuntime: makeRuntime,
		now: () => clock.value,
		autosaveIntervalMs: intervalMs,
	});
	return { driver, store, clock };
};

test("a scene transition triggers an autosave", async () => {
	const { driver, store } = harness();
	driver.runtime.goToScene("B");
	expect(await driver.onSceneTransition()).toBe(true);
	const saves = await driver.listSaves();
	expect(saves).toHaveLength(1);
	expect(saves[0]!.kind).toBe("auto");
	expect(await store.list()).toHaveLength(1);
	driver.runtime.dispose();
});

test("the timed interval triggers an autosave once enough time elapses", async () => {
	const { driver } = harness(1000);
	expect(await driver.tick(400)).toBe(false);
	expect(await driver.tick(400)).toBe(false);
	expect(await driver.listSaves()).toHaveLength(0);
	expect(await driver.tick(400)).toBe(true);
	expect(await driver.listSaves()).toHaveLength(1);
	driver.runtime.dispose();
});

test("saving is allowed mid-cutscene now that cutscenes are resumable", async () => {
	const { driver } = harness(1000);
	driver.runtime.world.ecs.createEntity([
		new CutsceneComponent({ id: "cs", scenes: [] }),
	]);

	expect(driver.canSave()).toBe(true);
	expect(await driver.onSceneTransition()).toBe(true);
	expect(await driver.quickSave()).toBe(true);
	expect(await driver.tick(5000)).toBe(true);
	const saves = await driver.listSaves();
	expect(saves.map((s) => s.kind).sort()).toEqual(["auto", "quick"]);
	driver.runtime.dispose();
});

test("quickSave then quickLoad round-trips persistent state into a fresh runtime", async () => {
	const { driver, clock } = harness();
	driver.runtime.world.ecs.getComponent(
		PLAYER_ID,
		HealthComponent,
	)!.hp = 42;

	expect(await driver.quickSave()).toBe(true);

	// Mutate live state after the save; quickLoad must discard it.
	driver.runtime.world.ecs.getComponent(
		PLAYER_ID,
		HealthComponent,
	)!.hp = 1;

	clock.value += 5000;
	expect(await driver.quickLoad()).toBe(true);

	expect(
		driver.runtime.world.ecs.getComponent(PLAYER_ID, HealthComponent)!
			.hp,
	).toBe(42);
	expect(driver.runtime.activeScene).toBe("A");
	driver.runtime.dispose();
});

test("manual saves round-trip through list + load and support delete", async () => {
	const { driver, clock } = harness();

	const alpha = await driver.manualSave("Alpha");
	clock.value += 1;
	const beta = await driver.manualSave("My Save");

	let saves = await driver.listSaves();
	expect(saves).toHaveLength(2);
	const labels = saves.map((s) => s.label).sort();
	expect(labels).toEqual(["Alpha", "My Save"]);
	expect(saves.every((s) => s.kind === "manual")).toBe(true);

	expect(await driver.load(alpha)).toBe(true);
	expect(driver.runtime.activeScene).toBe("A");

	await driver.deleteSave(beta);
	saves = await driver.listSaves();
	expect(saves).toHaveLength(1);
	expect(saves[0]!.label).toBe("Alpha");
	driver.runtime.dispose();
});

test("autosaves are never pruned (retention keeps all)", async () => {
	const { driver, clock } = harness(1000);
	for (let i = 0; i < 5; i++) {
		clock.value += 1000;
		expect(await driver.onSceneTransition()).toBe(true);
	}
	const saves = await driver.listSaves();
	expect(saves).toHaveLength(5);
	expect(saves.every((s) => s.kind === "auto")).toBe(true);
	driver.runtime.dispose();
});
