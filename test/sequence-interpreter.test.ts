import { describe, expect, test } from "bun:test";
import {
	blackboardEquals,
	branch,
	lockControl,
	parallel,
	releaseControl,
	seq,
	sequenceDef,
} from "../src/engine/sequence/builder";
import { SequenceComponent } from "../src/engine/sequence/sequence-component";
import {
	isAnySequenceActive,
	isExclusiveSequenceActive,
} from "../src/engine/sequence/sequence-system";
import { SequenceFixture } from "./support/sequence-harness";
import {
	SequenceProbeComponent,
	sequenceSceneConfig,
	TEST_OP,
	testOp,
} from "./support/sequence-scene";

const counts = (fixture: SequenceFixture): Record<string, number> => {
	const entry = fixture.ecs.query(SequenceProbeComponent)[0];
	return entry ? entry[1].counts : {};
};

const sequenceRun = (fixture: SequenceFixture) => {
	const entry = fixture.ecs.query(SequenceComponent)[0];
	return entry?.[1].run;
};

const hold = (stepId: string, counter: string, frames: number) =>
	testOp(TEST_OP.hold, stepId, { counter, frames });

const setBlackboard = (stepId: string, key: string, value: string) =>
	testOp(TEST_OP.setBlackboard, stepId, { key, value });

const mark = (stepId: string, counter: string) =>
	testOp(TEST_OP.mark, stepId, { counter });

describe("sequence interpreter mechanics", () => {
	test("write-once memory: an in-flight op is not re-derived on resume", async () => {
		const def = sequenceDef({
			id: "write-once",
			class: "exclusive",
			cast: {},
			root: seq("root", hold("only", "fx", 6)),
		});
		const fixture = await SequenceFixture.create(
			sequenceSceneConfig(def),
		);

		fixture.step(1);
		expect(counts(fixture).fx).toBe(1);

		await fixture.saveAndReload();
		fixture.step(10);

		expect(counts(fixture).fx).toBe(1);
		expect(fixture.ecs.query(SequenceComponent).length).toBe(0);
		fixture.dispose();
	});

	test("a pinned branch result is not re-decided on resume", async () => {
		const def = sequenceDef({
			id: "pinned-branch",
			class: "exclusive",
			cast: {},
			root: seq(
				"root",
				setBlackboard("set", "answer", "yes"),
				branch(
					"decide",
					blackboardEquals({ key: "answer", value: "yes" }),
					hold("true-arm", "trueC", 30),
					mark("false-arm", "falseC"),
				),
			),
		});
		const fixture = await SequenceFixture.create(
			sequenceSceneConfig(def),
		);

		fixture.step(2);
		expect(counts(fixture).trueC).toBe(1);
		expect(sequenceRun(fixture)?.pinnedBranches.decide).toBe(true);

		const run = sequenceRun(fixture)!;
		run.blackboard.answer = "no";

		await fixture.saveAndReload();
		fixture.step(40);

		expect(sequenceRun(fixture) ?? null).toBeNull();
		expect(counts(fixture).falseC ?? 0).toBe(0);
		expect(counts(fixture).trueC).toBe(1);
		fixture.dispose();
	});

	test("cursor tree (per-parallel-child) round-trips through save/load", async () => {
		const def = sequenceDef({
			id: "cursor-tree",
			class: "exclusive",
			cast: {},
			root: seq(
				"root",
				parallel("par", hold("short", "A", 2), hold("long", "B", 10)),
			),
		});
		const fixture = await SequenceFixture.create(
			sequenceSceneConfig(def),
		);

		fixture.step(3);
		let run = sequenceRun(fixture)!;
		expect(run.completed).toContain("short");
		expect(run.completed).not.toContain("long");

		await fixture.saveAndReload();

		run = sequenceRun(fixture)!;
		expect(run.completed).toContain("short");
		expect(run.completed).not.toContain("long");
		fixture.dispose();
	});

	test("controlReleased round-trips and drives the freeze gate", async () => {
		const def = sequenceDef({
			id: "control-release",
			class: "exclusive",
			cast: {},
			root: seq(
				"root",
				releaseControl("rel"),
				hold("mid", "c", 2),
				lockControl("lock"),
				hold("tail", "c2", 40),
			),
		});
		const fixture = await SequenceFixture.create(
			sequenceSceneConfig(def),
		);

		fixture.step(1);
		expect(sequenceRun(fixture)?.controlReleased).toBe(true);
		expect(isExclusiveSequenceActive(fixture.ecs)).toBe(false);
		expect(isAnySequenceActive(fixture.ecs)).toBe(true);

		await fixture.saveAndReload();
		expect(sequenceRun(fixture)?.controlReleased).toBe(true);
		expect(isExclusiveSequenceActive(fixture.ecs)).toBe(false);

		fixture.step(2);
		expect(sequenceRun(fixture)?.controlReleased).toBe(false);
		expect(isExclusiveSequenceActive(fixture.ecs)).toBe(true);
		expect(counts(fixture).c).toBe(1);
		expect(counts(fixture).c2).toBe(1);
		fixture.dispose();
	});
});
