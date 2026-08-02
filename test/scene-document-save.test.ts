import { Glob } from "bun";
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createEntity } from "../src/editor/commands";
import { SceneDocument } from "../src/editor/scene-document";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { migrateRenderLayers } from "../src/engine/render/migrate-render-layers";
import { migrateSky } from "../src/engine/sky/migrate-sky";
import {
	Scene,
	type SceneFile,
	toSceneConfig,
} from "../src/engine/scene/scene";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { serializeWorld } from "../src/engine/serialization/serialize";
import { TileLayerComponent } from "../src/engine/tilemap/tile-layer-component";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";
import { migrateLegacyTiles } from "../src/game/scenes/migrate-legacy-tiles";

const loadRapierHeadless = (): Promise<void> =>
	loadRapier(async () => {
		const mod =
			(await import("@dimforge/rapier2d-compat")) as unknown as {
				init: () => Promise<void>;
			};
		await mod.init();
		return mod as never;
	});

// Register every component the way the shipped bundle's eager globs do; a
// missing registration would surface here as a throwing deserialize under the
// document-open policy rather than a silent skip.
const registerComponents = async (): Promise<void> => {
	for (const path of new Glob(
		"src/{engine,game}/**/*-component.ts",
	).scanSync(".")) {
		await import(`../${path.replace(/\\/g, "/")}`);
	}
};

const demoFile = (): SceneFile =>
	JSON.parse(
		readFileSync("src/game/content/levels/demo.scene.json", "utf8"),
	) as SceneFile;

const openDocument = (baseline: SceneFile): SceneDocument => {
	const config = toSceneConfig(baseline.config);
	const world = new World(config.gravity);
	deserializeWorld(world, baseline.entities, "test", "throw");
	const scene = new Scene({
		kind: baseline.kind,
		name: baseline.name ?? "test",
		config,
		world,
	});
	return new SceneDocument(scene, baseline);
};

const json = (file: SceneFile): string =>
	JSON.stringify(file, null, "\t");

beforeAll(async () => {
	await loadRapierHeadless();
	await registerComponents();
});

describe("scene document save (replay onto scratch)", () => {
	test("a no-op save reproduces the migrated baseline byte-for-byte", () => {
		const baseline = migrateLegacyTiles(
			migrateSky(migrateRenderLayers(demoFile(), "demo"), "demo"),
			"demo",
			"dirt.png",
		);
		const doc = openDocument(baseline);

		const saved = doc.save();

		expect(json(saved)).toBe(json(baseline));
	});

	test("undo past a save is not resurrected on the next save", () => {
		const baseline = migrateRenderLayers(
			{
				version: 1,
				kind: "platformer",
				config: { gravity: { x: 0, y: 20 } },
				entities: [],
			},
			"demo",
		);
		const doc = openDocument(baseline);

		const idA = createEntity(doc, [
			new TransformComponent(new Vector2(10, 10)),
		]);
		const idB = createEntity(doc, [
			new TransformComponent(new Vector2(20, 20)),
		]);

		const firstSave = doc.save();
		doc.markSaved(firstSave);
		const savedIds = firstSave.entities.map((e) => e.id);
		expect(savedIds).toContain(idA);
		expect(savedIds).toContain(idB);

		// Undo appends B's inverse rather than truncating the log — the fix for
		// the pre-4b index-mark scheme, under which replaying from the save mark
		// would re-run [A, B] and resurrect the undone create.
		const lengthBeforeUndo = doc.journal.length;
		doc.undo();
		expect(doc.journal.length).toBe(lengthBeforeUndo + 1);

		const secondSave = doc.save();
		const remaining = secondSave.entities.map((e) => e.id);
		expect(remaining).toContain(idA);
		expect(remaining).not.toContain(idB);

		// Equals a from-scratch replay of [A, B, B⁻¹].
		const replayed = openDocument(baseline);
		createEntity(replayed, [
			new TransformComponent(new Vector2(10, 10)),
		]);
		const replayB = createEntity(replayed, [
			new TransformComponent(new Vector2(20, 20)),
		]);
		replayed.undo();
		const replaySave = replayed.save();
		expect(replaySave.entities.length).toBe(
			secondSave.entities.length,
		);
		expect(replaySave.entities.map((e) => e.id)).not.toContain(
			replayB,
		);
	});

	test("legacy tiles migrate, a journaled paint saves, one TileLayer results", () => {
		const legacy: SceneFile = {
			version: 1,
			kind: "platformer",
			config: { gravity: { x: 0, y: 20 } },
			tiles: [
				{ x: 0, y: 0, w: 2, h: 1 },
				{ x: 5, y: 3, w: 1, h: 1 },
			],
			entities: [],
		};
		const baseline = migrateLegacyTiles(
			migrateSky(migrateRenderLayers(legacy, "demo"), "demo"),
			"demo",
			"dirt.png",
		);
		const doc = openDocument(baseline);

		doc.record({
			kind: "tile-op",
			layerId: "demo:tile-layer" as never,
			added: [{ gx: 10, gy: 10 }],
			removed: [],
		});

		const saved = doc.save();

		const layers = saved.entities.filter(
			(e) => "TileLayer" in e.components,
		);
		expect(layers.length).toBe(1);
		expect(layers[0]!.id).toBe("demo:tile-layer");

		const cells = (
			layers[0]!.components.TileLayer as {
				cells: ReadonlyArray<{
					x: number;
					y: number;
					w: number;
					h: number;
				}>;
			}
		).cells;
		expect(cells).toContainEqual({ x: 10, y: 10, w: 1, h: 1 });
		expect(cells).toContainEqual({ x: 0, y: 0, w: 2, h: 1 });
		expect(cells).toContainEqual({ x: 5, y: 3, w: 1, h: 1 });

		// Round-trip + replay-diff tripwires ran inside save() without crashing.
		const layerEntity = doc.scene.world.ecs.getComponent(
			"demo:tile-layer" as never,
			TileLayerComponent,
		);
		expect(layerEntity?.grid.hasTile(10, 10)).toBe(true);
	});
});

// The guard that outlives the deleted runtime-provenance flag: with no live
// world ever serialized into a scene file, provenance is enforced by
// construction and the surviving obligation is that every committed level round
// trips losslessly through the one serializer. A whole-world serialize of a
// committed file's entities, deserialized and re-serialized, must reproduce
// itself byte-for-byte — an unregistered or non-reconstructable component would
// break the round-trip here. This replaces the old registry-derived denylist
// (which asserted no `runtime: true` component appears in a level file).
describe("committed level files round-trip losslessly", () => {
	const json = (world: unknown): string =>
		JSON.stringify(world, null, "\t");

	const levels = [
		...new Glob("src/game/content/levels/*.scene.json").scanSync("."),
	];

	test("at least one committed level exists to guard", () => {
		expect(levels.length).toBeGreaterThan(0);
	});

	for (const path of levels) {
		test(`${path} round-trips whole`, () => {
			const file = JSON.parse(
				readFileSync(path, "utf8"),
			) as SceneFile;
			const gravity = toSceneConfig(file.config).gravity;

			const first = new World(gravity);
			deserializeWorld(first, file.entities, path, "throw");
			const once = serializeWorld(first.ecs);
			first.dispose();

			const second = new World(gravity);
			deserializeWorld(second, once, path, "throw");
			const twice = serializeWorld(second.ecs);
			second.dispose();

			expect(json(twice)).toBe(json(once));
		});
	}
});
