import { Glob } from "bun";
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createEntity } from "../src/editor/commands";
import { SceneDocument } from "../src/editor/scene-document";
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
import { migrateLegacyTiles } from "../src/game/scenes/migrate-legacy-tiles";
import { WeatherOverrideComponent } from "../src/engine/weather/weather-override-component";
import { WeatherStateComponent } from "../src/engine/weather/weather-state-component";
import { SequenceFixture } from "./support/sequence-harness";
import {
	FIXTURE_PRESETS,
	registerFixtureClimates,
	spawnOverride,
	weatherHarnessConfig,
} from "./support/weather-fixture";

/**
 * Weather run-state must be unrepresentable in an authored scene file. The plan's
 * claim is structural — `SceneDocument.save()` replays the edit journal onto a
 * scratch world that has never simulated — so this suite exists to *document* the
 * guarantee and to keep it from going vacuous.
 *
 * The first test is the anti-vacuity check: it proves `WeatherState` and
 * `WeatherOverride` really do serialize, so their absence from the artifact is a
 * property of the construction rather than of the components being invisible.
 */

const loadRapierHeadless = async (): Promise<void> => {
	const { loadRapier } =
		await import("../src/engine/physics/rapier-physics");
	await loadRapier(async () => {
		const mod =
			(await import("@dimforge/rapier2d-compat")) as unknown as {
				init: () => Promise<void>;
			};
		await mod.init();
		return mod as never;
	});
};

const registerComponents = async (): Promise<void> => {
	for (const path of new Glob(
		"src/{engine,game}/**/*-component.ts",
	).scanSync(".")) {
		await import(`../${path.replace(/\\/g, "/")}`);
	}
};

const demoBaseline = (): SceneFile =>
	migrateLegacyTiles(
		migrateRenderLayers(
			JSON.parse(
				readFileSync(
					"src/game/content/levels/demo.scene.json",
					"utf8",
				),
			) as SceneFile,
			"demo",
		),
		"demo",
		"dirt.png",
	);

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

const typeNames = (file: SceneFile): ReadonlySet<string> => {
	const names = new Set<string>();
	for (const entity of file.entities) {
		for (const name of Object.keys(entity.components)) {
			names.add(name);
		}
	}
	return names;
};

beforeAll(async () => {
	await loadRapierHeadless();
	await registerComponents();
	registerFixtureClimates();
});

describe("weather run-state never reaches an authored scene file", () => {
	test("a simulated world does serialize both weather run-state types", async () => {
		const fixture = await SequenceFixture.create(
			weatherHarnessConfig(),
		);
		fixture.step(4);
		spawnOverride(fixture, {
			presetId: FIXTURE_PRESETS.gale,
			priority: 5,
		});
		fixture.step();

		const live = serializeWorld(fixture.ecs);
		const names = new Set(
			live.flatMap((entity) => Object.keys(entity.components)),
		);

		expect(names.has("WeatherState")).toBe(true);
		expect(names.has("WeatherOverride")).toBe(true);

		fixture.dispose();
	});

	test("an authored artifact carries no scheduler state", () => {
		const saved = openDocument(demoBaseline()).save();

		expect(typeNames(saved).has("WeatherState")).toBe(false);
	});

	test("a scene that authors no weather saves none", () => {
		const baseline = migrateRenderLayers(
			{
				version: 1,
				kind: "platformer",
				config: { gravity: { x: 0, y: 20 } },
				entities: [],
			},
			"bare",
		);
		const doc = openDocument(baseline);
		createEntity(doc, [new TransformComponent(new Vector2(0, 0))]);

		const names = typeNames(doc.save());

		expect(names.has("WeatherState")).toBe(false);
		expect(names.has("WeatherOverride")).toBe(false);
	});

	test("weather run-state leaked into the edit world crashes the save", () => {
		const baseline = demoBaseline();
		const doc = openDocument(baseline);
		doc.scene.world.ecs.createEntity([new WeatherStateComponent()]);

		expect(() => doc.save()).toThrow(/replay-diff tripwire/);
	});

	test("a leaked override crashes the save too", () => {
		const baseline = demoBaseline();
		const doc = openDocument(baseline);
		doc.scene.world.ecs.createEntity([
			new WeatherOverrideComponent(),
		]);

		expect(() => doc.save()).toThrow(/replay-diff tripwire/);
	});
});
