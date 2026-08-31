import { beforeAll, describe, expect, test } from "bun:test";
import { generateBolt } from "../src/engine/weather/lightning";
import { LightningStrikeEvent } from "../src/engine/weather/lightning-strike-event";
import { LightningSystem } from "../src/engine/weather/lightning-system";
import type { AuthoredClimateCatalog } from "../src/engine/weather/climate";
import { registerClimateCatalog } from "../src/engine/weather/climate-registry";
import { serializeWorld } from "../src/engine/serialization/serialize";
import {
	type UpdateContext,
	UpdateSystem,
} from "../src/engine/system";
import { FLASH_ENVELOPE } from "../src/engine/settings/flash-envelope";
import { SequenceFixture } from "./support/sequence-harness";
import {
	FIXTURE_TAU,
	weatherHarnessConfig,
} from "./support/weather-fixture";

/**
 * Three properties of lightning, and only three. Bolt *appearance*, thunder and
 * the rate tuning are all still moving and none of them is locked here.
 *
 * 1. **A strike event fully describes its bolt.** The whole design rests on the
 *    event being the seam — a late consumer, a replay, a game-layer subscriber
 *    added years from now — and that is worth nothing if the geometry is not a
 *    function of the seed.
 * 2. **The scheduler creates no entities.** This is the invisible-failure class:
 *    lightning runs in the editor's live edit world, where an entity the save
 *    tripwire can see corrupts a scene file, and nothing about a bolt looking
 *    right would ever surface it. `test/vfx-snapshot.test.ts` is the precedent.
 * 3. **The flash cap holds under an absurd rate.** A safety property, not a
 *    look: photosensitivity guidance caps flashes at three a second and roughly
 *    1 in 4,000 people can seize when it is violated. A catalog authored with a
 *    silly rate must thin strikes, not stack them.
 */

const STORM = "test-storm";

/**
 * A throwaway catalog whose one preset strikes a hundred times a second —
 * absurd on purpose, and never the shipped rate.
 */
const CATALOG: AuthoredClimateCatalog = {
	defaultClimateId: STORM,
	presets: [
		{
			id: STORM,
			wind: 0.8,
			precipitation: { rain: 0.9 },
			direction: 1,
			lightning: 6000,
		},
	],
	climates: [
		{
			id: STORM,
			defaultPreset: STORM,
			entries: [
				{
					preset: STORM,
					weight: 1,
					dwellMin: 100,
					dwellMax: 100,
				},
			],
		},
	],
};

/** Records every strike the scheduler publishes, in the frame it publishes it. */
class StrikeRecorder implements UpdateSystem {
	readonly strikes: {
		frame: number;
		event: LightningStrikeEvent;
	}[] = [];
	private frame = 0;

	update({ events }: UpdateContext): void {
		for (const event of events.read(LightningStrikeEvent)) {
			this.strikes.push({ frame: this.frame, event });
		}
		this.frame++;
	}
}

const stormFixture = async (): Promise<{
	fixture: SequenceFixture;
	recorder: StrikeRecorder;
}> => {
	const recorder = new StrikeRecorder();
	const fixture = await SequenceFixture.create(
		weatherHarnessConfig({
			extraSystems: [new LightningSystem(), recorder],
		}),
	);
	return { fixture, recorder };
};

const boltPoints = (event: LightningStrikeEvent): number[] =>
	generateBolt(
		event.seed,
		event.skyX,
		event.skyY,
		event.x,
		event.y,
	).strands.flatMap((strand) => [...strand.x, ...strand.y]);

beforeAll(() => {
	registerClimateCatalog(
		CATALOG,
		"test/lightning.test.ts fixture catalog",
		FIXTURE_TAU,
	);
});

describe("lightning", () => {
	test("a bolt is reproducible from its strike event alone", async () => {
		const { fixture, recorder } = await stormFixture();
		fixture.step(120);

		expect(recorder.strikes.length).toBeGreaterThan(2);
		const [first, second] = recorder.strikes;
		const points = boltPoints(first!.event);

		expect(points.length).toBeGreaterThan(60);
		expect(boltPoints(first!.event)).toEqual(points);
		expect(boltPoints(second!.event)).not.toEqual(points);

		fixture.dispose();
	});

	test("the scheduler creates and destroys no entities", async () => {
		const { fixture, recorder } = await stormFixture();
		fixture.step(1);
		const before = serializeWorld(fixture.ecs);

		fixture.step(600);

		expect(recorder.strikes.length).toBeGreaterThan(10);
		const after = serializeWorld(fixture.ecs);
		expect(after.length).toBe(before.length);
		expect(
			[
				...new Set(
					after.flatMap((entity) => Object.keys(entity.components)),
				),
			].toSorted(),
		).toEqual([
			"PersistentComponent",
			"SceneClimate",
			"WeatherState",
		]);

		fixture.dispose();
	});

	test("the flash cap holds under an absurd strike rate", async () => {
		const { fixture, recorder } = await stormFixture();
		fixture.step(600);

		// 100 strikes a second were authored; ten seconds of them must still
		// arrive at no more than three in any one-second window.
		for (const { event } of recorder.strikes) {
			const window = recorder.strikes.filter(
				({ event: other }) =>
					other.time > event.time - 1 && other.time <= event.time,
			);
			expect(window.length).toBeLessThanOrEqual(
				FLASH_ENVELOPE.maxPerSecond,
			);
		}
		expect(recorder.strikes.length).toBeGreaterThan(10);

		fixture.dispose();
	});
});
