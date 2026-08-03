import { Camera2D } from "../../src/engine/camera/camera-2d";
import { Camera2DComponent } from "../../src/engine/camera/camera-2d-component";
import type { EntityId, ReadonlyECS } from "../../src/engine/ecs";
import type { SceneDefinition } from "../../src/engine/runtime/runtime";
import { SceneConfig } from "../../src/engine/scene/scene";
import {
	type RainBlockingMode,
	type TileCollisionMode,
	TileLayerComponent,
} from "../../src/engine/tilemap/tile-layer-component";
import { TransformComponent } from "../../src/engine/transform-component";
import Vector2 from "../../src/engine/vector2";
import { EmitterComponent } from "../../src/engine/vfx/emitter-component";
import { registerVfxCatalog } from "../../src/engine/vfx/vfx-registry";
import {
	createVfxSystems,
	type VfxSystems,
} from "../../src/engine/vfx/vfx-systems";
import { AmbientClockSystem } from "../../src/engine/weather/ambient-clock";
import { SceneClimateComponent } from "../../src/engine/weather/scene-climate-component";
import { WeatherPresentationSystem } from "../../src/engine/weather/weather-presentation-system";
import type { World } from "../../src/engine/world";
import type { SequenceFixture } from "./sequence-harness";

/**
 * VFX boot for {@link SequenceFixture}: authored effect defs, scenes carrying
 * emitter entities with pinned ids, and the systems in their shipped arrangement
 * — the update system where `ambientSystems()` puts it, the render system
 * omitted because there is no GL context headlessly.
 *
 * {@link VfxHarness.systems} is how a test reaches the store after a
 * save/restore: the harness builds a *fresh* runtime on reload, so the store the
 * test held is deliberately dead and the new one must be read back from here.
 * That is the whole point — a store cannot outlive the world it belongs to.
 *
 * `EmitterComponent` is imported by name rather than for its side effect because
 * a `@serializable` class no test imports is absent from the registry and
 * `deserializeWorld` silently skips it, which would make every save/restore
 * assertion pass vacuously.
 */

/** The fixture effect ids, so no test spells one out. */
export const FIXTURE_EFFECTS = {
	drift: "drift",
	puff: "puff",
	dying: "dying",
	settling: "settling",
	riding: "riding",
	downpour: "downpour",
	streaks: "streaks",
	smear: "smear",
} as const;

/**
 * An authored emitter part with everything a test does not care about filled in.
 * The overrides are the authored JSON's own keys, so a test reads as the JSON it
 * stands for.
 */
const part = (
	overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
	layer: "entities",
	emission: { rate: 20, burst: 0 },
	spawn: { shape: "point" },
	lifetime: { min: 1, max: 1 },
	size: { min: 2, max: 2 },
	...overrides,
});

/**
 * Eight effects covering the behaviours the core has to get right: a plain
 * continuous drift, a one-shot puff, a drift that dies into that puff, a
 * settling collider, a local-space rider, a precipitation-scaled downpour, a
 * band of wind-driven ribbons, and a collider that leaves decals.
 */
export const FIXTURE_VFX: ReadonlyArray<unknown> = [
	{ id: FIXTURE_EFFECTS.drift, parts: [part()] },
	{
		id: FIXTURE_EFFECTS.puff,
		parts: [
			part({
				emission: { rate: 0, burst: 3 },
				lifetime: { min: 0.25, max: 0.25 },
			}),
		],
	},
	{
		id: FIXTURE_EFFECTS.dying,
		parts: [
			part({
				emission: { rate: 10, burst: 0 },
				lifetime: { min: 0.1, max: 0.1 },
				speed: { min: 200, max: 200 },
				angle: { min: 90, max: 90 },
				onDeath: FIXTURE_EFFECTS.puff,
			}),
		],
	},
	{
		id: FIXTURE_EFFECTS.settling,
		parts: [
			part({
				emission: { rate: 0, burst: 4 },
				speed: { min: 100, max: 100 },
				angle: { min: 90, max: 90 },
				collision: {
					mode: "tiles",
					response: "rest",
					restChance: 1,
				},
			}),
		],
	},
	{
		id: FIXTURE_EFFECTS.riding,
		parts: [
			part({ space: "local", emission: { rate: 30, burst: 0 } }),
		],
	},
	{
		id: FIXTURE_EFFECTS.downpour,
		parts: [
			part({
				emission: { rate: 60, burst: 0 },
				weather: { rain: 1 },
			}),
		],
	},
	{
		id: FIXTURE_EFFECTS.smear,
		parts: [
			part({
				emission: { rate: 0, burst: 4 },
				lifetime: { min: 2, max: 2 },
				speed: { min: 100, max: 100 },
				angle: { min: 90, max: 90 },
				collision: {
					mode: "tiles",
					response: "rest",
					restChance: 1,
				},
				decal: {
					layer: "overlay",
					order: 0,
					size: { min: 3, max: 3 },
					lifetime: { min: 30, max: 30 },
				},
			}),
		],
	},
	{
		id: FIXTURE_EFFECTS.streaks,
		parts: [
			{
				kind: "ribbon",
				layer: "overlay",
				order: 1,
				count: 6,
				segments: 8,
				lifetime: { min: 2, max: 2 },
				length: { min: 60, max: 90 },
				path: {
					generator: "wander",
					amplitude: 4,
					waves: 1.5,
					tilt: 8,
				},
				width: { base: 2, taperHead: 0.2, taperTail: 0.2 },
				wind: 30,
			},
		],
	},
];

/** Install the fixture catalog. Idempotent; replaces whatever was registered. */
export const registerFixtureVfx = (): void => {
	registerVfxCatalog(FIXTURE_VFX, "test fixture vfx catalog");
};

/** One authored emitter in a fixture scene. */
export type FixtureEmitter = Readonly<{
	id: EntityId;
	defId: string;
	x?: number;
	y?: number;
	rateScale?: number;
	enabled?: boolean;
}>;

/**
 * An active camera in a fixture scene. `viewportWidth`/`viewportHeight` are what
 * a real render pass would have written; headlessly nothing does, and a zero
 * viewport makes `visibleBounds()` degenerate — so a camera-band part needs them
 * set explicitly to spawn over any width at all.
 */
export type FixtureCamera = Readonly<{
	x?: number;
	y?: number;
	zoom?: number;
	viewportWidth?: number;
	viewportHeight?: number;
}>;

/**
 * One authored tile layer, spelled out — which cells it holds, whether it stops
 * the player, and whether it stops rain. The two classifications are independent,
 * which is the whole point of authoring a layer this way rather than through
 * {@link VfxScene.solidCells}.
 */
export type FixtureTileLayer = Readonly<{
	cells: ReadonlyArray<readonly [number, number]>;
	collision?: TileCollisionMode;
	rainBlocking?: RainBlockingMode;
}>;

/** One authored fixture scene. */
export type VfxScene = Readonly<{
	emitters?: ReadonlyArray<FixtureEmitter>;
	/** Solid tile cells, as `[gx, gy]` grid coordinates. */
	solidCells?: ReadonlyArray<readonly [number, number]>;
	/**
	 * Extra tile layers with explicit classifications, for the cases where
	 * solidity and rain-blocking deliberately disagree.
	 */
	layers?: ReadonlyArray<FixtureTileLayer>;
	/** Authored climate, for the weather-scaled emission hook. */
	climateId?: string | null;
	/** Whether the scene reads as an interior, which masks visible weather. */
	indoor?: boolean;
	/** An active camera, which a `camera-band` spawn shape needs. */
	camera?: FixtureCamera;
}>;

/** A scene's authored camera, so a test can move the view mid-run. */
export const fixtureCamera = (ecs: ReadonlyECS): Camera2D => {
	const found = ecs.query(Camera2DComponent)[0];
	if (!found) {
		throw new Error("vfx-fixture: this scene has no camera");
	}
	return found[1].camera;
};

/** A pinned entity id, so assertions survive a save/restore round trip. */
export const emitterId = (suffix: string): EntityId =>
	`00000000-0000-4000-8000-0000000000${suffix}` as EntityId;

export const DEFAULT_VFX_SCENE = "field";

const sceneDefinition = (scene: VfxScene): SceneDefinition => ({
	config: new SceneConfig(),
	build: (world: World): void => {
		for (const authored of scene.emitters ?? []) {
			const emitter = new EmitterComponent();
			emitter.defId = authored.defId;
			emitter.rateScale = authored.rateScale ?? 1;
			emitter.enabled = authored.enabled ?? true;
			world.ecs.createEntity(
				[
					new TransformComponent(
						new Vector2(authored.x ?? 0, authored.y ?? 0),
					),
					emitter,
				],
				authored.id,
			);
		}
		if (scene.solidCells && scene.solidCells.length > 0) {
			const layer = new TileLayerComponent();
			for (const [gx, gy] of scene.solidCells) {
				layer.grid.setTile(gx, gy);
			}
			world.ecs.createEntity([layer]);
		}
		for (const authored of scene.layers ?? []) {
			const layer = new TileLayerComponent();
			layer.collision = authored.collision ?? "solid";
			layer.rainBlocking = authored.rainBlocking ?? "auto";
			for (const [gx, gy] of authored.cells) {
				layer.grid.setTile(gx, gy);
			}
			world.ecs.createEntity([layer]);
		}
		if (scene.camera) {
			const camera = new Camera2D(
				new Vector2(scene.camera.x ?? 0, scene.camera.y ?? 0),
				scene.camera.zoom ?? 1,
			);
			camera.viewportWidth = scene.camera.viewportWidth ?? 640;
			camera.viewportHeight = scene.camera.viewportHeight ?? 360;
			world.ecs.createEntity([new Camera2DComponent(camera)]);
		}
		if (scene.climateId !== undefined || scene.indoor !== undefined) {
			const climate = new SceneClimateComponent();
			climate.climateId = scene.climateId ?? null;
			climate.indoor = scene.indoor ?? false;
			world.ecs.createEntity([climate]);
		}
	},
});

export type VfxFixtureOptions = Readonly<{
	scenes?: Readonly<Record<string, VfxScene>>;
	initialScene?: string;
	/** Pinned store PRNG seed, so drawn values repeat across runs. */
	seed?: number;
}>;

export type VfxHarness = Readonly<{
	/** Config for {@link SequenceFixture.create}. */
	config: Parameters<typeof SequenceFixture.create>[0];
	/** The VFX systems of the most recently built runtime, including its store. */
	systems: () => VfxSystems;
}>;

/**
 * A {@link SequenceFixture} config booting the VFX systems. Register a catalog
 * (usually {@link registerFixtureVfx}) before creating the fixture.
 *
 * @example
 * registerFixtureVfx();
 * const harness = vfxHarness({ scenes: { field: { emitters: [{ id, defId: "drift" }] } } });
 * const fixture = await SequenceFixture.create(harness.config);
 * fixture.step(10);
 * expect(harness.systems().store.particleCount(id)).toBeGreaterThan(0);
 */
export const vfxHarness = (
	options: VfxFixtureOptions = {},
): VfxHarness => {
	const scenes = options.scenes ?? { [DEFAULT_VFX_SCENE]: {} };
	const scenesById = new Map<string, SceneDefinition>(
		Object.entries(scenes).map(([id, scene]) => [
			id,
			sceneDefinition(scene),
		]),
	);
	const built: VfxSystems[] = [];
	return {
		config: {
			initialScene: options.initialScene ?? DEFAULT_VFX_SCENE,
			seed: (): void => {},
			resolveScene: (id: string): SceneDefinition => {
				const scene = scenesById.get(id);
				if (!scene) {
					throw new Error(`vfx-fixture: unknown scene "${id}"`);
				}
				return scene;
			},
			registerSystems: (world: World): void => {
				const vfx = createVfxSystems(options.seed ?? 1337);
				built.push(vfx);
				world.ecs.addUpdateSystem(new AmbientClockSystem());
				world.ecs.addUpdateSystem(new WeatherPresentationSystem());
				world.ecs.addUpdateSystem(vfx.update);
			},
		},
		systems: (): VfxSystems => {
			const latest = built[built.length - 1];
			if (!latest) {
				throw new Error(
					"vfx-fixture: no runtime has been built yet; create the fixture first.",
				);
			}
			return latest;
		},
	};
};
