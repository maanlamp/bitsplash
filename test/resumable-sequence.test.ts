import { expect, test } from "bun:test";
import type { Seconds } from "../src/engine/duration";
import type { EntityId } from "../src/engine/ecs";
import {
	ResumableSequence,
	type SequenceApi,
	type Step,
} from "../src/engine/sequence/resumable-sequence";
import { SequenceState } from "../src/engine/sequence/sequence-state";
import {
	decodeValue,
	encodeValue,
} from "../src/engine/serialization/value";

type TestWorld = {
	effects: string[];
	spawned: EntityId[];
	doorOpen: boolean;
};

const makeWorld = (doorOpen: boolean): TestWorld => ({
	effects: [],
	spawned: [],
	doorOpen,
});

const sample = function* (
	s: SequenceApi<TestWorld>,
): Generator<Step<TestWorld>, void, void> {
	s.spawn("hero", (w) => {
		const id = crypto.randomUUID();
		w.spawned.push(id);
		return id;
	});
	s.effect((w) => w.effects.push("approach"));
	yield s.step("approach", (_w, t) => t.elapsed >= 2);

	const open = s.read((w) => w.doorOpen);
	if (open) {
		s.effect((w) => w.effects.push("through"));
		yield s.step("through", (_w, t) => t.elapsed >= 1);
	} else {
		s.effect((w) => w.effects.push("wait-door"));
		yield s.step("wait-door", (_w, t) => t.elapsed >= 1);
	}

	s.effect((w) => w.effects.push("finish"));
	yield s.step("finish", (_w, t) => t.elapsed >= 1);
};

const DT = 0.5 as Seconds;

const runToEnd = (
	seq: ResumableSequence<TestWorld>,
	world: TestWorld,
) => {
	for (let i = 0; i < 1000 && seq.status === "running"; i++) {
		seq.update(world, DT);
	}
};

const roundTrip = (state: SequenceState): SequenceState =>
	decodeValue(encodeValue(state)) as SequenceState;

test("uninterrupted run fires each effect exactly once, in order", () => {
	const world = makeWorld(true);
	const seq = new ResumableSequence(sample);
	runToEnd(seq, world);

	expect(seq.done).toBe(true);
	expect(world.effects).toEqual(["approach", "through", "finish"]);
	expect(world.spawned.length).toBe(1);
});

test("resume mid-step after serialize round-trip does not re-fire past effects and finishes identically", () => {
	const baseline = makeWorld(true);
	runToEnd(new ResumableSequence(sample), baseline);

	const world = makeWorld(true);
	const seq = new ResumableSequence(sample);
	seq.update(world, DT);
	seq.update(world, DT);
	seq.update(world, DT);
	seq.update(world, DT);
	seq.update(world, DT);

	expect(seq.state.stepId).toBe("through");
	expect(seq.state.elapsedInStep).toBeCloseTo(0.5);
	expect(world.effects).toEqual(["approach", "through"]);
	expect(world.spawned.length).toBe(1);
	const savedHandle = world.spawned[0];

	const captured = roundTrip(seq.state);

	expect(captured.stepId).toBe("through");
	expect(captured.elapsedInStep).toBeCloseTo(0.5);
	expect(captured.spawnedRefs.hero).toBe(savedHandle);

	const resumedWorld = makeWorld(true);
	const resumed = new ResumableSequence(sample);
	resumed.seek(captured, resumedWorld);

	expect(resumed.status).toBe("running");
	expect(resumed.state.stepId).toBe("through");
	expect(resumed.state.elapsedInStep).toBeCloseTo(0.5);
	expect(resumedWorld.effects).toEqual([]);
	expect(resumedWorld.spawned).toEqual([]);
	expect(resumed.state.spawnedRefs.hero).toBe(savedHandle);

	runToEnd(resumed, resumedWorld);

	expect(resumed.done).toBe(true);
	expect(resumedWorld.effects).toEqual(["finish"]);
	expect([...world.effects, ...resumedWorld.effects]).toEqual(
		baseline.effects,
	);
});

test("branch re-evaluates against the restored world; divergence surfaces as an error", () => {
	const world = makeWorld(true);
	const seq = new ResumableSequence(sample);
	for (let i = 0; i < 5; i++) {
		seq.update(world, DT);
	}
	expect(seq.state.stepId).toBe("through");

	const captured = roundTrip(seq.state);

	const divergentWorld = makeWorld(false);
	const divergent = new ResumableSequence(sample);
	divergent.seek(captured, divergentWorld);

	expect(divergent.status).toBe("error");
	expect(divergentWorld.effects).toEqual([]);
});

test("a throwing step surfaces an error state instead of propagating", () => {
	const boom = function* (
		s: SequenceApi<TestWorld>,
	): Generator<Step<TestWorld>, void, void> {
		yield s.step("kaboom", () => {
			throw new Error("step blew up");
		});
	};
	const world = makeWorld(true);
	const seq = new ResumableSequence(boom);
	seq.update(world, DT);

	expect(seq.status).toBe("error");
	expect(seq.error?.message).toBe("step blew up");
	seq.update(world, DT);
	expect(seq.status).toBe("error");
});
