import { describe, expect, test } from "bun:test";
import { migrateRenderLayers } from "../src/engine/render/migrate-render-layers";
import { DEFAULT_RENDER_LAYERS } from "../src/engine/render/render-layers";
import "../src/engine/render/render-layers-component";
import type { SceneFile } from "../src/engine/scene/scene";
import "../src/engine/tilemap/tile-layer-component";
import { migrateLegacyTiles } from "../src/game/scenes/migrate-legacy-tiles";

const baseFile = (overrides: Partial<SceneFile> = {}): SceneFile => ({
	version: 1,
	kind: "platformer",
	config: { gravity: { x: 0, y: 20 } },
	entities: [],
	...overrides,
});

describe("render-layers migration", () => {
	test("inserts a deterministic RenderLayers entity when absent", () => {
		const migrated = migrateRenderLayers(baseFile(), "demo");

		expect(migrated.entities.length).toBe(1);
		const entity = migrated.entities[0]!;
		expect(entity.id).toBe("demo:render-layers");

		const layers = (
			entity.components.RenderLayers as {
				layers: ReadonlyArray<{ id: string }>;
			}
		).layers;
		expect(layers.map((def) => def.id)).toEqual([
			...DEFAULT_RENDER_LAYERS,
		]);
	});

	test("appends after existing entities (Map insertion order)", () => {
		const file = baseFile({
			entities: [{ id: "a", components: { Transform: {} } }],
		});
		const migrated = migrateRenderLayers(file, "demo");

		expect(migrated.entities.map((entity) => entity.id)).toEqual([
			"a",
			"demo:render-layers",
		]);
	});

	test("is idempotent when a RenderLayers entity already exists", () => {
		const once = migrateRenderLayers(baseFile(), "demo");
		const twice = migrateRenderLayers(once, "demo");

		expect(twice).toBe(once);
		expect(
			twice.entities.filter(
				(entity) => "RenderLayers" in entity.components,
			).length,
		).toBe(1);
	});
});

describe("legacy-tiles migration", () => {
	const tiles = [
		{ x: 0, y: 0, w: 2, h: 1 },
		{ x: 5, y: 3, w: 1, h: 1 },
	];

	test("upgrades a flat tiles array into a deterministic TileLayer", () => {
		const migrated = migrateLegacyTiles(
			baseFile({ tiles }),
			"demo",
			"dirt.png",
		);

		expect(migrated.entities.length).toBe(1);
		const entity = migrated.entities[0]!;
		expect(entity.id).toBe("demo:tile-layer");

		const layer = entity.components.TileLayer as {
			name: string;
			tilesetRef: { path: string };
			cells: ReadonlyArray<{ x: number; y: number }>;
		};
		expect(layer.name).toBe("terrain");
		expect(layer.tilesetRef.path).toBe("dirt.png");
		expect(layer.cells).toEqual(tiles);
	});

	test("appends the layer after existing entities", () => {
		const file = baseFile({
			tiles,
			entities: [{ id: "a", components: { Transform: {} } }],
		});
		const migrated = migrateLegacyTiles(file, "demo", "dirt.png");

		expect(migrated.entities.map((entity) => entity.id)).toEqual([
			"a",
			"demo:tile-layer",
		]);
	});

	test("does not apply when there are no tiles", () => {
		const file = baseFile();
		expect(migrateLegacyTiles(file, "demo", "dirt.png")).toBe(file);
	});

	test("is idempotent — running twice adds only one TileLayer", () => {
		const once = migrateLegacyTiles(
			baseFile({ tiles }),
			"demo",
			"dirt.png",
		);
		const twice = migrateLegacyTiles(once, "demo", "dirt.png");

		expect(twice).toBe(once);
		expect(
			twice.entities.filter(
				(entity) => "TileLayer" in entity.components,
			).length,
		).toBe(1);
	});
});
