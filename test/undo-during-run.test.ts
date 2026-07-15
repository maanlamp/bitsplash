import { Glob } from "bun";
import { beforeAll, describe, expect, test } from "bun:test";
import { createEntity } from "../src/editor/commands";
import { SceneDocument } from "../src/editor/scene-document";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { migrateRenderLayers } from "../src/engine/render/migrate-render-layers";
import {
	Scene,
	type SceneFile,
	toSceneConfig,
} from "../src/engine/scene/scene";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { serializeWorld } from "../src/engine/serialization/serialize";
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

beforeAll(async () => {
	await loadRapierHeadless();
	await registerComponents();
});

describe("undo below run start during a run", () => {
	test("stop leaves the edit world equal to the document projection", () => {
		const baseline = emptyScene();
		const document = openDocument(baseline);

		// Two edits made before the run.
		const idA = createEntity(document, [
			new TransformComponent(new Vector2(10, 10)),
		]);
		const idB = createEntity(document, [
			new TransformComponent(new Vector2(20, 20)),
		]);

		// Start a run: bind a fresh run world as the router's live target. The run
		// world does not carry the pre-run entities (they were applied to the edit
		// world only), which exercises the D7 best-effort mirror.
		document.journal.runStart = document.journal.length;
		const runWorld = new World(document.config.gravity);
		document.bindRun({ world: runWorld, config: document.config });

		// Undo below the run-start position (undoes B), then add a new edit during
		// the run. The pre-step-5 index-mark scheme resurrected B and dropped the
		// new edit; the append-only journal must not.
		document.undo();
		const idC = createEntity(document, [
			new TransformComponent(new Vector2(30, 30)),
		]);

		// Stop: unbind and rebuild the edit world from baseline + journal.
		document.unbindRun();
		document.rebuildLive();
		runWorld.dispose();

		const editWorld = serializeWorld(document.scene.world.ecs);
		const ids = new Set(editWorld.map((e) => e.id));
		expect(ids.has(idA)).toBe(true);
		expect(ids.has(idC)).toBe(true);
		expect(ids.has(idB)).toBe(false);

		// The edit world is exactly the document's authored projection.
		const projection = document.toAuthoredScene().entities;
		expect(JSON.stringify(editWorld)).toBe(
			JSON.stringify(projection),
		);
	});
});
