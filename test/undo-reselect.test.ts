import { beforeAll, describe, expect, test } from "bun:test";
import { createEntity, deleteEntities } from "../src/editor/commands";
import { EditorState } from "../src/editor/editor-state";
import { SceneDocument } from "../src/editor/scene-document";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { migrateRenderLayers } from "../src/engine/render/migrate-render-layers";
import "../src/engine/transform-component";
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

const openBoundDocument = (): Readonly<{
	doc: SceneDocument;
	store: EditorState;
}> => {
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
	const doc = new SceneDocument(scene, baseline);
	const store = new EditorState();
	doc.bindSelection({
		capture: () => store.snapshot(),
		restore: (snap) => store.restore(snap),
	});
	return { doc, store };
};

beforeAll(async () => {
	await loadRapierHeadless();
});

describe("undo-reselect", () => {
	test("undo/redo restores the selection at each cursor position", () => {
		const { doc, store } = openBoundDocument();

		const idA = createEntity(doc, [
			new TransformComponent(new Vector2(10, 10)),
		]);
		store.selectOne(idA);
		const idB = createEntity(doc, [
			new TransformComponent(new Vector2(20, 20)),
		]);
		store.selectOne(idB);
		expect(store.primaryId).toBe(idB);

		// Undo B's create: selection returns to what it was before that edit.
		doc.undo();
		expect([...store.selection.ids]).toEqual([idA]);
		expect(store.primaryId).toBe(idA);

		// Undo A's create: back to the empty pre-edit selection.
		doc.undo();
		expect(store.selectedCount).toBe(0);

		// Redo A then B: the post-edit selections come back.
		doc.redo();
		expect([...store.selection.ids]).toEqual([idA]);
		doc.redo();
		expect([...store.selection.ids]).toEqual([idB]);
	});

	test("a restored snapshot drops ids the edit deleted", () => {
		const { doc, store } = openBoundDocument();

		const idA = createEntity(doc, [
			new TransformComponent(new Vector2(10, 10)),
		]);
		store.selectOne(idA);

		// Undoing the create removes idA; the pre-create (empty) selection is
		// restored rather than a dangling reference to the vanished entity.
		doc.undo();
		expect(store.has(idA)).toBe(false);
		expect(store.selectedCount).toBe(0);
	});

	test("a composite delete undoes as one step and reselects the set", () => {
		const { doc, store } = openBoundDocument();

		const idA = createEntity(doc, [
			new TransformComponent(new Vector2(10, 10)),
		]);
		const idB = createEntity(doc, [
			new TransformComponent(new Vector2(20, 20)),
		]);
		store.select([idA, idB]);

		deleteEntities(doc, [idA, idB]);
		store.clear();
		expect(doc.scene.world.ecs.entities()).not.toContain(idA);
		expect(doc.scene.world.ecs.entities()).not.toContain(idB);

		// One undo brings both back (single composite step) and restores the
		// pre-delete selection.
		doc.undo();
		expect(doc.scene.world.ecs.entities()).toContain(idA);
		expect(doc.scene.world.ecs.entities()).toContain(idB);
		expect([...store.selection.ids].toSorted()).toEqual(
			[idA, idB].toSorted(),
		);
	});
});
