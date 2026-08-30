import { beforeAll, describe, expect, test } from "bun:test";
import { createEntity } from "../src/editor/commands";
import { getPickIndex } from "../src/editor/pick-index";
import { pickEntityAt } from "../src/editor/pick";
import { SceneDocument } from "../src/editor/scene-document";
import { ECS, type EntityId } from "../src/engine/ecs";
import { PhysicsBodyComponent } from "../src/engine/physics/physics-body-component";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { migrateRenderLayers } from "../src/engine/render/migrate-render-layers";
import {
	Scene,
	type SceneFile,
	toSceneConfig,
} from "../src/engine/scene/scene";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";

const pickAt = (doc: SceneDocument, x: number, y: number) => {
	const ecs = doc.scene.world.ecs;
	getPickIndex(ecs).maintain();
	return pickEntityAt(ecs, new Vector2(x, y));
};

const makeEntity = (doc: SceneDocument, x: number): EntityId =>
	createEntity(doc, [
		new TransformComponent(new Vector2(x, 0)),
		new PhysicsBodyComponent("static", 8, 8),
	]);

const emptyFile = (): SceneFile =>
	migrateRenderLayers(
		{
			version: 1,
			kind: "platformer",
			config: { gravity: { x: 0, y: 20 } },
			entities: [],
		},
		"demo",
	);

const loadRapierHeadless = (): Promise<void> =>
	loadRapier(async () => {
		const mod =
			(await import("@dimforge/rapier2d-compat")) as unknown as {
				init: () => Promise<void>;
			};
		await mod.init();
		return mod as never;
	});

describe("pick index narrow phase (topmost smallest-area hit)", () => {
	test("a small entity nested in a big one wins at the overlap", () => {
		const ecs = new ECS();
		const big = ecs.createEntity([
			new TransformComponent(new Vector2(0, 0)),
			new PhysicsBodyComponent("static", 50, 50),
		]);
		const small = ecs.createEntity([
			new TransformComponent(new Vector2(0, 0)),
			new PhysicsBodyComponent("static", 10, 10),
		]);
		getPickIndex(ecs).maintain();

		// Over both: the smaller-area piece wins the topmost tie-break.
		expect(pickEntityAt(ecs, new Vector2(0, 0))).toBe(small);
		// Inside the big one but outside the small one: the big one.
		expect(pickEntityAt(ecs, new Vector2(40, 0))).toBe(big);
		// Outside both.
		expect(pickEntityAt(ecs, new Vector2(200, 0))).toBeNull();
	});

	test("the broad phase never misses an offset collider", () => {
		const ecs = new ECS();
		const id = ecs.createEntity([
			new TransformComponent(new Vector2(0, 0)),
			// A collider offset well away from the transform pivot.
			new PhysicsBodyComponent(
				"static",
				12,
				12,
				1,
				0,
				0,
				true,
				0,
				"default",
				false,
				100,
				0,
			),
		]);
		getPickIndex(ecs).maintain();

		expect(pickEntityAt(ecs, new Vector2(100, 0))).toBe(id);
		expect(pickEntityAt(ecs, new Vector2(0, 0))).toBeNull();
	});
});

describe("pick index maintenance across churn", () => {
	beforeAll(async () => {
		await loadRapierHeadless();
	});

	const openDocument = (): SceneDocument => {
		const baseline = emptyFile();
		const config = toSceneConfig(baseline.config);
		const world = new World(config.gravity);
		deserializeWorld(world, baseline.entities, "test", "throw");
		const scene = new Scene({
			kind: baseline.kind,
			name: baseline.name ?? "demo",
			config,
			world,
		});
		return new SceneDocument(scene, baseline);
	};

	// Re-fetch the ecs each call: a rebuild/revert may swap the world, and the
	// index is keyed per-ecs — a stale ecs reference would query a dead index.
	test("pick is correct after an undo/redo replay", () => {
		const doc = openDocument();
		const id = makeEntity(doc, 100);
		expect(pickAt(doc, 100, 0)).toBe(id);

		doc.undo();
		expect(pickAt(doc, 100, 0)).toBeNull();

		doc.redo();
		expect(pickAt(doc, 100, 0)).toBe(id);
	});

	test("pick is correct after a moved entity's transform commit", () => {
		const doc = openDocument();
		const id = makeEntity(doc, 100);
		expect(pickAt(doc, 100, 0)).toBe(id);

		doc.record({
			kind: "entity-move",
			id: id as never,
			before: { x: 100, y: 0 },
			after: { x: 300, y: 0 },
		});
		expect(pickAt(doc, 100, 0)).toBeNull();
		expect(pickAt(doc, 300, 0)).toBe(id);
	});

	test("pick is correct after rebuildLive (run-stop world resume)", () => {
		const doc = openDocument();
		const id = makeEntity(doc, 100);
		expect(pickAt(doc, 100, 0)).toBe(id);

		doc.rebuildLive();
		expect(pickAt(doc, 100, 0)).toBe(id);
	});

	test("pick is empty after a revert to an empty baseline", () => {
		const doc = openDocument();
		makeEntity(doc, 100);
		expect(pickAt(doc, 100, 0)).not.toBeNull();

		doc.revert();
		expect(pickAt(doc, 100, 0)).toBeNull();
	});

	test("distinct worlds keep independent indices (run world swap)", () => {
		const a = openDocument();
		const b = openDocument();
		expect(getPickIndex(a.scene.world.ecs)).not.toBe(
			getPickIndex(b.scene.world.ecs),
		);
	});
});
