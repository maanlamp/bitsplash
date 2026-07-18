import { Glob } from "bun";
import { beforeAll, describe, expect, test } from "bun:test";
import {
	createEntity,
	multiEntityFieldBinding,
} from "../src/editor/commands";
import { SceneDocument } from "../src/editor/scene-document";
import type { EntityId } from "../src/engine/ecs";
import { HealthComponent } from "../src/game/health/health-component";
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

const loadRapierHeadless = (): Promise<void> =>
	loadRapier(async () => {
		const mod =
			(await import("@dimforge/rapier2d-compat")) as unknown as {
				init: () => Promise<void>;
			};
		await mod.init();
		return mod as never;
	});

const registerComponents = async (): Promise<void> => {
	for (const path of new Glob(
		"src/{engine,game}/**/*-component.ts",
	).scanSync(".")) {
		await import(`../${path.replace(/\\/g, "/")}`);
	}
};

const emptyScene = (): SceneFile =>
	migrateRenderLayers(
		{
			version: 1,
			kind: "platformer",
			config: { gravity: { x: 0, y: 20 } },
			entities: [],
		},
		"demo",
	);

const openDocument = (baseline: SceneFile): SceneDocument => {
	const config = toSceneConfig(baseline.config);
	const world = new World(config.gravity);
	deserializeWorld(world, baseline.entities, "edit world", "throw");
	const scene = new Scene({
		kind: baseline.kind,
		name: "demo",
		config,
		world,
	});
	return new SceneDocument(scene, baseline);
};

const positionOf = (
	document: SceneDocument,
	id: EntityId,
): { x: number; y: number } => {
	const t = document.projection.getComponent(id, TransformComponent);
	return { x: t!.position.x, y: t!.position.y };
};

beforeAll(async () => {
	await loadRapierHeadless();
	await registerComponents();
});

describe("composite poke-aware routing (plan F6)", () => {
	test("a MIXED selection splits into a journaled authored group and a live-only poked runtime group", () => {
		const document = openDocument(emptyScene());

		// Two authored entities and a run.
		const a = createEntity(document, [
			new TransformComponent(new Vector2(10, 10)),
		]);
		const b = createEntity(document, [
			new TransformComponent(new Vector2(20, 20)),
		]);

		document.journal.runStart = document.journal.length;
		const runWorld = new World(document.config.gravity);
		document.bindRun({ world: runWorld, config: document.config });

		// A runtime-spawned entity: present in the run world, never authored.
		const r = runWorld.ecs.createEntity([
			new TransformComponent(new Vector2(0, 0)),
		]);

		const undoLenBefore = document.journal.length;

		// One keystroke moving all three: authored A + B and runtime R.
		expect(() =>
			document.record({
				kind: "composite",
				entries: [
					{
						kind: "entity-move",
						id: a,
						before: { x: 10, y: 10 },
						after: { x: 50, y: 50 },
					},
					{
						kind: "entity-move",
						id: b,
						before: { x: 20, y: 20 },
						after: { x: 60, y: 60 },
					},
					{
						kind: "entity-move",
						id: r,
						before: { x: 0, y: 0 },
						after: { x: 99, y: 99 },
					},
				],
			}),
		).not.toThrow();

		// Authored part journaled and applied to the edit world.
		expect(positionOf(document, a)).toEqual({ x: 50, y: 50 });
		expect(positionOf(document, b)).toEqual({ x: 60, y: 60 });

		// Runtime part poked live-only into the run world.
		const rt = runWorld.ecs.getComponent(r, TransformComponent);
		expect({ x: rt!.position.x, y: rt!.position.y }).toEqual({
			x: 99,
			y: 99,
		});

		// The runtime entity was never journaled onto the document.
		expect(document.isMember(r)).toBe(false);
		expect(
			document.toAuthoredScene().entities.some((e) => e.id === r),
		).toBe(false);

		// Exactly ONE undo step for the authored part.
		expect(document.journal.length).toBe(undoLenBefore + 1);
		document.undo();
		expect(positionOf(document, a)).toEqual({ x: 10, y: 10 });
		expect(positionOf(document, b)).toEqual({ x: 20, y: 20 });

		// Undo of the authored part does not touch the runtime poke.
		const rtAfter = runWorld.ecs.getComponent(r, TransformComponent);
		expect(rtAfter!.position.x).toBe(99);

		document.unbindRun();
		runWorld.dispose();
	});

	test("an ALL-runtime composite journals nothing", () => {
		const document = openDocument(emptyScene());
		document.journal.runStart = document.journal.length;
		const runWorld = new World(document.config.gravity);
		document.bindRun({ world: runWorld, config: document.config });
		const r1 = runWorld.ecs.createEntity([
			new TransformComponent(new Vector2(0, 0)),
		]);
		const r2 = runWorld.ecs.createEntity([
			new TransformComponent(new Vector2(1, 1)),
		]);

		const lenBefore = document.journal.length;
		document.record({
			kind: "composite",
			entries: [
				{
					kind: "entity-move",
					id: r1,
					before: { x: 0, y: 0 },
					after: { x: 5, y: 5 },
				},
				{
					kind: "entity-move",
					id: r2,
					before: { x: 1, y: 1 },
					after: { x: 6, y: 6 },
				},
			],
		});
		expect(document.journal.length).toBe(lenBefore);
		expect(document.canUndo).toBe(false);
		expect(
			runWorld.ecs.getComponent(r1, TransformComponent)!.position.x,
		).toBe(5);

		document.unbindRun();
		runWorld.dispose();
	});
});

describe("inspector multi-edit fan-out (plan F5)", () => {
	test("one field edit fans out to all selected as ONE composite (one undo)", () => {
		const document = openDocument(emptyScene());
		const a = createEntity(document, [new HealthComponent(100, 100)]);
		const b = createEntity(document, [new HealthComponent(80, 50)]);

		const lenBefore = document.journal.length;
		const binding = multiEntityFieldBinding(
			document,
			[a, b],
			"Health",
		);
		binding.commit(["hp"], 75);

		const hp = (id: EntityId) =>
			document.projection.getComponent(id, HealthComponent)!.hp;
		expect(hp(a)).toBe(75);
		expect(hp(b)).toBe(75);

		// Exactly one undo step reverts both.
		expect(document.journal.length).toBe(lenBefore + 1);
		document.undo();
		expect(hp(a)).toBe(100);
		expect(hp(b)).toBe(50);
	});

	test("the before===after guard is per entity: an entity already at the value contributes no entry", () => {
		const document = openDocument(emptyScene());
		const a = createEntity(document, [new HealthComponent(100, 75)]);
		const b = createEntity(document, [new HealthComponent(100, 50)]);

		multiEntityFieldBinding(document, [a, b], "Health").commit(
			["hp"],
			75,
		);
		const hp = (id: EntityId) =>
			document.projection.getComponent(id, HealthComponent)!.hp;
		expect(hp(a)).toBe(75);
		expect(hp(b)).toBe(75);

		// Only B changed, so a single undo restores only B.
		document.undo();
		expect(hp(a)).toBe(75);
		expect(hp(b)).toBe(50);
	});
});
