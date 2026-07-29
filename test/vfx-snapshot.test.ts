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

/** Every component type name the snapshot is allowed to contain. */
const ALLOWED_TYPES = ["Transform", "Emitter"];

/**
 * `drift` emits 20/s over a 1s lifetime, so seed-by-age places exactly 20
 * particles. A running pool wanders a few either side of that as individual
 * seeded ages expire, which is why a re-seeded population is compared against
 * this rather than against the pre-save count.
 */
const DRIFT_STEADY_STATE = 20;

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

		const snapshot = fixture.runtime.snapshot();
		const scene = snapshot.scenes[DEFAULT_VFX_SCENE]!;

		// Exactly the two authored entities: a particle never became one.
		expect(scene.map((entity) => entity.id).sort()).toEqual(
			[HOST, OTHER].sort(),
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

		// Nothing anywhere in the blob mentions a particle.
		const blob = JSON.stringify(snapshot);
		for (const smell of [
			"particle",
			"accumulator",
			"pool",
			"age",
			"velocity",
			"vx",
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

		await fixture.saveAndReload();

		// The restored world's store is a different object with nothing in it: the
		// run-state was never captured, so there was nothing to put back.
		const after = harness.systems().store;
		expect(after).not.toBe(before);
		expect(after.totalParticles()).toBe(0);

		// One frame later the emitter has re-derived its whole steady-state
		// population from config — seed-by-age, not a restored pool.
		fixture.step(1);
		expect(after.particleCount(HOST)).toBe(DRIFT_STEADY_STATE);
		expect(after.particleCount(OTHER)).toBeGreaterThan(0);

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

		fixture.dispose();
	});

	test("seeded particles are spread over their lifetime, not stacked at birth", async () => {
		registerFixtureVfx();
		const harness = harnessFor();
		const fixture = await SequenceFixture.create(harness.config);
		fixture.step(1);

		const effect = harness.systems().store.attachedEffect(HOST)!;
		const pool = effect.pools[0]!;
		const ages = [...pool.age.subarray(0, pool.count)];
		expect(Math.min(...ages)).toBeLessThan(0.25);
		expect(Math.max(...ages)).toBeGreaterThan(0.75);

		fixture.dispose();
	});
});
