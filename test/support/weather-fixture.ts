import type { SceneDefinition } from "../../src/engine/runtime/runtime";
import type { UpdateSystem } from "../../src/engine/system";
import { SceneConfig } from "../../src/engine/scene/scene";
import { AmbientClockSystem } from "../../src/engine/weather/ambient-clock";
import {
	weatherChannels,
	type WeatherChannels,
} from "../../src/engine/weather/channels";
import type { AuthoredClimateCatalog } from "../../src/engine/weather/climate";
import { registerClimateCatalog } from "../../src/engine/weather/climate-registry";
import { SceneClimateComponent } from "../../src/engine/weather/scene-climate-component";
import { WeatherOverrideComponent } from "../../src/engine/weather/weather-override-component";
import { WeatherPresentationSystem } from "../../src/engine/weather/weather-presentation-system";
import { WeatherSchedulerSystem } from "../../src/engine/weather/weather-scheduler-system";
import { WeatherStateComponent } from "../../src/engine/weather/weather-state-component";
import type { World } from "../../src/engine/world";
import type { SequenceFixture } from "./sequence-harness";

/**
 * Weather boot for {@link SequenceFixture}: a fixture climate catalog plus the
 * three weather systems in their shipped arrangement — the scheduler where
 * `gameplaySystems` puts it, the ambient clock and presentation where
 * `ambientSystems()` does.
 *
 * The component classes are imported by name rather than for their side effect
 * because a `@serializable` class no test imports is absent from the registry and
 * `deserializeWorld` silently skips it, which would make every save/restore
 * assertion here pass vacuously.
 */

/** The fixture catalog's climate ids, so tests never spell one out. */
export const FIXTURE_CLIMATES = {
	mild: "mild",
	harsh: "harsh",
} as const;

/** The fixture catalog's preset ids. */
export const FIXTURE_PRESETS = {
	still: "still",
	shower: "shower",
	gale: "gale",
} as const;

/**
 * Two climates over three presets, with dwells in fractions of a second so a
 * preset pick boundary is a handful of frames away rather than a minute.
 *
 * `mild` has a dwell *range*, so its dwell length is a real PRNG draw; `harsh`
 * has a fixed dwell, so a test can cross a scene change without racing a roll.
 * `still` is reachable only through `mild`, which is what lets a test prove an
 * override or a preview can name a preset the active climate would never roll.
 */
export const FIXTURE_CATALOG: AuthoredClimateCatalog = {
	defaultClimateId: FIXTURE_CLIMATES.mild,
	presets: [
		{
			id: FIXTURE_PRESETS.still,
			wind: 0,
			direction: 1,
		},
		{
			id: FIXTURE_PRESETS.shower,
			wind: 0.4,
			precipitation: { rain: 0.8 },
			direction: 1,
		},
		{
			id: FIXTURE_PRESETS.gale,
			wind: 1,
			precipitation: { rain: 0.5, sand: 0.2 },
			direction: -1,
		},
	],
	climates: [
		{
			id: FIXTURE_CLIMATES.mild,
			defaultPreset: FIXTURE_PRESETS.still,
			entries: [
				{
					preset: FIXTURE_PRESETS.still,
					weight: 1,
					dwellMin: 0.2,
					dwellMax: 0.4,
				},
				{
					preset: FIXTURE_PRESETS.shower,
					weight: 1,
					dwellMin: 0.2,
					dwellMax: 0.4,
				},
			],
		},
		{
			id: FIXTURE_CLIMATES.harsh,
			defaultPreset: FIXTURE_PRESETS.gale,
			entries: [
				{
					preset: FIXTURE_PRESETS.gale,
					weight: 3,
					dwellMin: 0.5,
					dwellMax: 0.5,
				},
				{
					preset: FIXTURE_PRESETS.shower,
					weight: 1,
					dwellMin: 0.5,
					dwellMax: 0.5,
				},
			],
		},
	],
};

/**
 * The chase time constant every fixture world runs with, and the one the fixture
 * catalog is validated against.
 *
 * Deliberately tiny so the eased scalars reach their targets within a frame or
 * two. It has to be passed to *both* the registry and the scheduler: catalog
 * validation rejects a dwell too short for the chase to arrive in, and the
 * fixture's sub-second dwells only clear that bar because the chase is this
 * fast.
 */
export const FIXTURE_TAU = 0.001;

/** Install the fixture catalog. Idempotent; replaces whatever was registered. */
export const registerFixtureClimates = (tau = FIXTURE_TAU): void => {
	registerClimateCatalog(
		FIXTURE_CATALOG,
		"test fixture catalog",
		tau,
	);
};

/** One authored scene: which climate schedules it, and whether it reads indoors. */
export type WeatherScene = Readonly<{
	climateId?: string | null;
	indoor?: boolean;
}>;

export type WeatherFixtureOptions = Readonly<{
	/** Scenes by id. Defaults to a single outdoor scene inheriting the default climate. */
	scenes?: Readonly<Record<string, WeatherScene>>;
	initialScene?: string;
	/** Pinned PRNG seed for a fresh weather state. */
	seed?: number;
	/**
	 * Scalar chase time constant, defaulting to {@link FIXTURE_TAU}. Register the
	 * catalog with the same value — dwells are validated against it.
	 */
	tau?: number;
	/**
	 * Systems appended after the three weather ones, in order — for a consumer
	 * that reads the published weather frame, such as the lightning scheduler.
	 */
	extraSystems?: readonly UpdateSystem[];
}>;

export const DEFAULT_WEATHER_SCENE = "outside";

const sceneDefinition = (scene: WeatherScene): SceneDefinition => ({
	config: new SceneConfig(),
	build: (world: World): void => {
		const climate = new SceneClimateComponent();
		climate.climateId = scene.climateId ?? null;
		climate.indoor = scene.indoor ?? false;
		world.ecs.createEntity([climate]);
	},
});

/**
 * A {@link SequenceFixture} config booting the weather systems over the fixture
 * catalog. Register the catalog (or a bespoke one) before calling — the config
 * itself installs nothing, so a test can also boot the weather-off world.
 *
 * @example
 * registerFixtureClimates();
 * const fixture = await SequenceFixture.create(weatherHarnessConfig({ seed: 4242 }));
 */
export const weatherHarnessConfig = (
	options: WeatherFixtureOptions = {},
) => {
	const scenes = options.scenes ?? {
		[DEFAULT_WEATHER_SCENE]: {},
	};
	const scenesById = new Map<string, SceneDefinition>(
		Object.entries(scenes).map(([id, scene]) => [
			id,
			sceneDefinition(scene),
		]),
	);
	const seed = options.seed ?? 4242;
	return {
		initialScene: options.initialScene ?? DEFAULT_WEATHER_SCENE,
		seed: (): void => {},
		resolveScene: (id: string): SceneDefinition => {
			const scene = scenesById.get(id);
			if (!scene) {
				throw new Error(`weather-fixture: unknown scene "${id}"`);
			}
			return scene;
		},
		registerSystems: (world: World): void => {
			world.ecs.addUpdateSystem(
				new WeatherSchedulerSystem({
					seed: () => seed,
					tau: options.tau ?? FIXTURE_TAU,
				}),
			);
			world.ecs.addUpdateSystem(new AmbientClockSystem());
			world.ecs.addUpdateSystem(new WeatherPresentationSystem());
			for (const system of options.extraSystems ?? []) {
				world.ecs.addUpdateSystem(system);
			}
		},
	};
};

/** Every serialized weather field, for exact continuity comparisons. */
export type WeatherSnapshot = Readonly<{
	climateId: string;
	presetId: string;
	wind: number;
	precipitation: WeatherChannels;
	direction: number;
	dwellRemaining: number;
	rng: number;
}>;

/** The world's weather state, or `null` when the scheduler never made one. */
export const weatherState = (
	fixture: SequenceFixture,
): WeatherStateComponent | null =>
	fixture.ecs.query(WeatherStateComponent)[0]?.[1] ?? null;

export const weatherSnapshot = (
	fixture: SequenceFixture,
): WeatherSnapshot => {
	const state = weatherState(fixture);
	if (!state) {
		throw new Error(
			"weather-fixture: no WeatherState yet; step the fixture at least once.",
		);
	}
	return {
		climateId: state.climateId,
		presetId: state.presetId,
		wind: state.wind,
		precipitation: weatherChannels((channel) => state[channel]),
		direction: state.direction,
		dwellRemaining: state.dwellRemaining,
		rng: state.rng,
	};
};

/** Spawn an override, optionally owned by a sequence-like entity. */
export const spawnOverride = (
	fixture: SequenceFixture,
	override: Partial<WeatherOverrideComponent>,
): void => {
	const component = new WeatherOverrideComponent();
	Object.assign(component, override);
	fixture.ecs.createEntity([component]);
};
