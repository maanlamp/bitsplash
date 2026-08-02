import { approach } from "../approach";
import type { ECS } from "../ecs";
import { profiler } from "../profiling/profiler";
import { randomRngSeed, rngNext } from "../rng";
import { PersistentComponent } from "../scene/persistent-component";
import { type UpdateContext, UpdateSystem } from "../system";
import { WEATHER_CHANNELS } from "./channels";
import type { Climate, ClimateEntry } from "./climate";
import { hasClimates, resolveClimate } from "./climate-registry";
import { DEFAULT_TAU } from "./easing";
import { sceneClimateId, weatherTargets } from "./effective-weather";
import { WeatherOverrideComponent } from "./weather-override-component";
import { WeatherStateComponent } from "./weather-state-component";

export type WeatherSchedulerOptions = Readonly<{
	/**
	 * Seed for a brand-new weather state's PRNG. Defaults to an unpredictable
	 * `uint32` so playthroughs differ; tests inject a constant to pin the rolls.
	 */
	seed?: () => number;
	/**
	 * Time constant, in seconds, of the scalar chase toward the targets. A
	 * catalog's dwells are validated against this at registration, so a test
	 * passing one here registers its catalog with the same value.
	 */
	tau?: number;
}>;

/**
 * Pick a climate entry by weight. `totalWeight` is validated positive, so the
 * loop always commits; the trailing entry is returned only to satisfy the
 * compiler when floating-point accumulation lands a hair short.
 */
const rollEntry = (
	climate: Climate,
	rng: number,
): readonly [ClimateEntry, number] => {
	const [roll, next] = rngNext(rng);
	const threshold = roll * climate.totalWeight;
	let accumulated = 0;
	for (const entry of climate.entries) {
		accumulated += entry.weight;
		if (threshold < accumulated) {
			return [entry, next];
		}
	}
	return [climate.entries[climate.entries.length - 1]!, next];
};

const rollDwell = (
	entry: ClimateEntry,
	rng: number,
): readonly [number, number] => {
	const [roll, next] = rngNext(rng);
	return [
		entry.dwellMin + roll * (entry.dwellMax - entry.dwellMin),
		next,
	];
};

/**
 * Drives the global weather: owns the run-state entity, reconciles it against the
 * active scene's climate, rolls the next preset when a dwell expires, and eases
 * the scalars toward whatever targets are effective.
 *
 * **Gameplay-only, and that is load-bearing.** This is the one weather system that
 * creates a serializable component and the one that destroys entities. Both are
 * fatal in the editor's live edit world, whose save path replays the edit journal
 * into a scratch world and diffs it against the live world serialized whole,
 * hard-crashing on any drift. Keep it in `gameplaySystems` and out of
 * `ambientSystems`.
 *
 * @example
 * // In a test, pin the rolls:
 * new WeatherSchedulerSystem({ seed: () => 1234 })
 */
@profiler("Weather scheduler", "Weather")
export class WeatherSchedulerSystem implements UpdateSystem {
	private readonly seed: () => number;
	private readonly tau: number;

	constructor(options: WeatherSchedulerOptions = {}) {
		this.seed = options.seed ?? randomRngSeed;
		this.tau = options.tau ?? DEFAULT_TAU;
	}

	update({ ecs, time }: UpdateContext): void {
		this.reclaimOrphanedOverrides(ecs);
		if (!hasClimates()) {
			return;
		}
		const climate = resolveClimate(sceneClimateId(ecs));
		const state = this.ensureState(ecs, climate);

		if (state.climateId !== climate.id) {
			state.climateId = climate.id;
			this.pick(state, climate);
		}

		state.dwellRemaining -= time.dt;
		if (state.dwellRemaining <= 0) {
			this.pick(state, climate);
		}

		const targets = weatherTargets(ecs);
		state.wind = approach(
			state.wind,
			targets.wind,
			time.dt,
			this.tau,
		);
		for (const channel of WEATHER_CHANNELS) {
			state[channel] = approach(
				state[channel],
				targets.precipitation[channel],
				time.dt,
				this.tau,
			);
		}
		state.direction = approach(
			state.direction,
			targets.direction,
			time.dt,
			this.tau,
		);
	}

	/**
	 * Destroy any override whose owning entity is gone.
	 *
	 * Polling is the release path, not bookkeeping at the end of a sequence,
	 * because polling is the only one that covers every ending at once: finished,
	 * skipped, rolled over onto a reused entity, and destroyed outright. An
	 * override with no owner is authored scene content and is left alone.
	 */
	private reclaimOrphanedOverrides(ecs: ECS): void {
		for (const [id, override] of ecs.query(
			WeatherOverrideComponent,
		)) {
			const owner = override.owner;
			if (owner === null || ecs.componentsOf(owner).length > 0) {
				continue;
			}
			ecs.destroy(id);
		}
	}

	/**
	 * The world's weather state, adopting a restored instance or seeding a fresh
	 * one at the climate's default preset. A second instance is a crash: two
	 * states would mean two authorities over one global mood.
	 */
	private ensureState(
		ecs: ECS,
		climate: Climate,
	): WeatherStateComponent {
		const found = ecs.query(WeatherStateComponent);
		if (found.length > 1) {
			throw new Error(
				`Weather: found ${found.length} WeatherState components; there is exactly one global weather state per world. Remove the authored duplicate.`,
			);
		}
		const existing = found[0]?.[1];
		if (existing) {
			return existing;
		}
		const state = new WeatherStateComponent();
		state.rng = this.seed() >>> 0;
		state.climateId = climate.id;
		state.presetId = climate.defaultPreset.id;
		state.wind = climate.defaultPreset.wind;
		for (const channel of WEATHER_CHANNELS) {
			state[channel] = climate.defaultPreset.precipitation[channel];
		}
		state.direction = climate.defaultPreset.direction;
		const entry = climate.entries.find(
			(candidate) => candidate.preset === climate.defaultPreset,
		)!;
		const [dwell, next] = rollDwell(entry, state.rng);
		state.dwellRemaining = dwell;
		state.rng = next;
		ecs.createEntity([state, new PersistentComponent()]);
		return state;
	}

	/** One weighted preset roll plus a fresh dwell for it. Advances the PRNG twice. */
	private pick(state: WeatherStateComponent, climate: Climate): void {
		const [entry, afterEntry] = rollEntry(climate, state.rng);
		const [dwell, afterDwell] = rollDwell(entry, afterEntry);
		state.presetId = entry.preset.id;
		state.dwellRemaining = dwell;
		state.rng = afterDwell;
	}
}
