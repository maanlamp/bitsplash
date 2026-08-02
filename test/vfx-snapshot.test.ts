import { afterAll, describe, expect, test } from "bun:test";
import type { SerializedWorld } from "../src/engine/serialization/registry";
import { clearVfxCatalog } from "../src/engine/vfx/vfx-registry";
import { SequenceFixture } from "./support/sequence-harness";
import {
	DEFAULT_VFX_SCENE,
	emitterId,
	FIXTURE_EFFECTS,
	registerFixtureVfx,
	vfxHarness,
} from "./support/vfx-fixture";

/**
 * The structural guarantee, asserted against the real artifact: a runtime
 * snapshot of a world full of live particles carries **no** VFX run-state, and
 * the emitters re-derive from their authored config on thaw.
 *
 * This is the tripwire that keeps the storage model honest. VFX run-state is the
 * codebase's one deliberately non-restorable state (see the doctrine note in
 * `AGENTS.md`); if somebody later "fixes" it by serializing pools, or lets a
 * particle become an entity, these assertions are what fails.
 */

const HOST = emitterId("01");
const OTHER = emitterId("02");
const RIBBONS = emitterId("03");

/** Every component type name the snapshot is allowed to contain. */
const ALLOWED_TYPES = ["Transform", "Emitter"];

/**
 * `drift` emits 20/s over a 1s lifetime, so seed-by-age places exactly 20
 * particles. A running pool wanders a few either side of that as individual
 * seeded ages expire, which is why a re-seeded population is compared against
 * this rather than against the pre-save count.
 */
const DRIFT_STEADY_STATE = 20;

/** `streaks` keeps six ribbons alive; a full band is what seeding must restore. */
const STREAKS_BAND = 6;

const typeNames = (world: SerializedWorld): string[] =>
	[
		...new Set(
			world.flatMap((entity) => Object.keys(entity.components)),
		),
	].sort();

afterAll(clearVfxCatalog);

const harnessFor = () =>
	vfxHarness({
		scenes: {
			[DEFAULT_VFX_SCENE]: {
				emitters: [
					{ id: HOST, defId: FIXTURE_EFFECTS.drift, x: 40, y: 10 },
					{ id: OTHER, defId: FIXTURE_EFFECTS.riding, x: -20, y: 5 },
					{
						id: RIBBONS,
						defId: FIXTURE_EFFECTS.streaks,
						x: 0,
						y: 0,
					},
				],
			},
		},
	});

describe("vfx snapshot semantics", () => {
	test("a snapshot of a world thick with particles carries no run-state and no orphans", async () => {
		registerFixtureVfx();
		const harness = harnessFor();
		const fixture = await SequenceFixture.create(harness.config);
		fixture.step(30);

		const store = harness.systems().store;
		expect(store.particleCount(HOST)).toBeGreaterThan(0);
		expect(store.particleCount(OTHER)).toBeGreaterThan(0);
		expect(store.ribbonCount(RIBBONS)).toBe(STREAKS_BAND);

		const snapshot = fixture.runtime.snapshot();
		const scene = snapshot.scenes[DEFAULT_VFX_SCENE]!;

		// Exactly the three authored entities: no particle and no ribbon ever
		// became one.
		expect(scene.map((entity) => entity.id).sort()).toEqual(
			[HOST, OTHER, RIBBONS].sort(),
		);
		expect(snapshot.persistent).toEqual([]);
		expect(typeNames(scene)).toEqual([...ALLOWED_TYPES].sort());

		// The emitter serializes its authored config and nothing else — no pool,
		// no accumulator, no `fired` flag.
		const emitter = scene.find((entity) => entity.id === HOST)!
			.components.Emitter!;
		expect(Object.keys(emitter).sort()).toEqual(
			["defId", "enabled", "offset", "rateScale"].sort(),
		);
		expect(emitter.defId).toBe(FIXTURE_EFFECTS.drift);

		// Nothing anywhere in the blob mentions a particle or a ribbon.
		const blob = JSON.stringify(snapshot);
		for (const smell of [
			"particle",
			"accumulator",
			"pool",
			"age",
			"velocity",
			"vx",
			"ribbon",
			"segments",
			"wander",
		]) {
			expect(blob).not.toContain(smell);
		}

		fixture.dispose();
	});

	test("restore drops every particle and the emitter re-seeds from config", async () => {
		registerFixtureVfx();
		const harness = harnessFor();
		const fixture = await SequenceFixture.create(harness.config);
		fixture.step(30);

		const before = harness.systems().store;
		expect(before.particleCount(HOST)).toBeGreaterThan(0);
		expect(before.ribbonCount(RIBBONS)).toBe(STREAKS_BAND);

		await fixture.saveAndReload();

		// The restored world's store is a different object with nothing in it: the
		// run-state was never captured, so there was nothing to put back.
		const after = harness.systems().store;
		expect(after).not.toBe(before);
		expect(after.totalParticles()).toBe(0);
		expect(after.totalRibbons()).toBe(0);

		// One frame later the emitters have re-derived their whole steady-state
		// population from config — seed-by-age, not a restored pool or band.
		fixture.step(1);
		expect(after.particleCount(HOST)).toBe(DRIFT_STEADY_STATE);
		expect(after.particleCount(OTHER)).toBeGreaterThan(0);
		expect(after.ribbonCount(RIBBONS)).toBe(STREAKS_BAND);

		fixture.dispose();
	});

	test("seed-by-age fills the population on the very first frame", async () => {
		registerFixtureVfx();
		const harness = harnessFor();
		const fixture = await SequenceFixture.create(harness.config);

		expect(harness.systems().store.totalParticles()).toBe(0);
		fixture.step(1);

		// `drift` emits 20/s over a 1s life, so its steady state is 20 particles —
		// present immediately rather than filling in over the next second.
		expect(harness.systems().store.particleCount(HOST)).toBe(
			DRIFT_STEADY_STATE,
		);
		expect(harness.systems().store.ribbonCount(RIBBONS)).toBe(
			STREAKS_BAND,
		);

		fixture.dispose();
	});

	test("seeded particles are spread over their lifetime, not stacked at birth", async () => {
		registerFixtureVfx();
		const harness = harnessFor();
		const fixture = await SequenceFixture.create(harness.config);
		fixture.step(1);

		const effect = harness.systems().store.attachedEffect(HOST)!;
		const state = effect.parts[0]!;
		if (state.kind !== "emitter") {
			throw new Error(
				"vfx-snapshot: drift part 0 should be an emitter",
			);
		}
		const pool = state.pool;
		const ages = [...pool.age.subarray(0, pool.count)];
		expect(Math.min(...ages)).toBeLessThan(0.25);
		expect(Math.max(...ages)).toBeGreaterThan(0.75);

		// Ribbons seed the same way, so a restored band is mid-fade rather than
		// all born together and all expiring together two seconds later.
		const band = harness.systems().store.attachedEffect(RIBBONS)!
			.parts[0]!;
		if (band.kind !== "ribbon") {
			throw new Error(
				"vfx-snapshot: streaks part 0 should be a ribbon",
			);
		}
		const lives = [...band.band.age.subarray(0, band.band.count)];
		expect(new Set(lives).size).toBe(STREAKS_BAND);

		fixture.dispose();
	});
});
