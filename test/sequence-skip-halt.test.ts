import { describe, expect, test } from "bun:test";
import {
	blackboardEquals,
	seq,
	sequenceDef,
	waitUntil,
} from "../src/engine/sequence/builder";
import { SequenceComponent } from "../src/engine/sequence/sequence-component";
import { SKIP_HOLD_SECONDS } from "../src/engine/sequence/sequence-system";
import { SequenceFixture } from "./support/sequence-harness";
import {
	SequenceProbeComponent,
	sequenceSceneConfig,
	TEST_OP,
	testOp,
} from "./support/sequence-scene";

const HOLD_FRAMES = 1000;

const counts = (fixture: SequenceFixture): Record<string, number> => {
	const entry = fixture.ecs.query(SequenceProbeComponent)[0];
	return entry ? entry[1].counts : {};
};

const component = (fixture: SequenceFixture): SequenceComponent => {
	const entry = fixture.ecs.query(SequenceComponent)[0];
	if (!entry) {
		throw new Error("the sequence is gone");
	}
	return entry[1];
};

const hold = (stepId: string, counter: string) =>
	testOp(TEST_OP.hold, stepId, { counter, frames: HOLD_FRAMES });

const gated = (stepId: string, counter: string, gate: string) =>
	testOp(TEST_OP.gated, stepId, { counter, gate });

/**
 * A skip held down over a `waitUntil` whose predicate is false: the ops before
 * the gate fast-forward, the gate itself halts the pass, and nothing past it is
 * touched until the predicate genuinely becomes true.
 */
const gateFixture = async (): Promise<SequenceFixture> =>
	SequenceFixture.create(
		sequenceSceneConfig(
			sequenceDef({
				id: "skip-halts-at-wait-until",
				class: "exclusive",
				cast: {},
				root: seq(
					"root",
					hold("before", "beforeC"),
					waitUntil(
						"gate",
						blackboardEquals({ key: "open", value: "yes" }),
					),
					hold("after", "afterC"),
				),
			}),
			{ skipHeld: () => true },
		),
	);

describe("skip halts at a waitUntil instead of forcing it", () => {
	test("ops before the gate fast-forward, the gate does not", async () => {
		const fixture = await gateFixture();

		fixture.step(200);

		const run = component(fixture).run;
		expect(component(fixture).currentSkippable).toBe(true);
		expect(run.completed).toContain("before");
		expect(run.completed).not.toContain("gate");
		expect(run.completed).not.toContain("after");
		fixture.dispose();
	});

	test("a held skip cannot carry past the gate by inertia", async () => {
		const fixture = await gateFixture();

		fixture.step(200);
		expect(component(fixture).run.completed).not.toContain("gate");

		fixture.step(600);
		const run = component(fixture).run;
		expect(run.completed).not.toContain("gate");
		expect(run.completed).not.toContain("after");
		fixture.dispose();
	});

	test("satisfying the predicate lets the skip resume", async () => {
		const fixture = await gateFixture();

		fixture.step(200);
		component(fixture).run.blackboard.open = "yes";
		fixture.step(80);

		expect(fixture.ecs.query(SequenceComponent).length).toBe(0);
		expect(counts(fixture).afterC).toBe(1);
		fixture.dispose();
	});
});

describe("skip input is gated on skippability", () => {
	test("an op reporting unskippable is never skipped, however long the key is held", async () => {
		const fixture = await SequenceFixture.create(
			sequenceSceneConfig(
				sequenceDef({
					id: "skip-gated-on-skippable",
					class: "exclusive",
					cast: {},
					root: seq("root", gated("locked", "lockedC", "open")),
				}),
				{ skipHeld: () => true },
			),
		);

		fixture.step(300);

		expect(component(fixture).currentSkippable).toBe(false);
		expect(component(fixture).skipHeldTime).toBe(0);
		expect(counts(fixture).lockedC ?? 0).toBe(0);

		component(fixture).run.blackboard.open = "yes";

		fixture.step(2);
		expect(component(fixture).currentSkippable).toBe(true);
		expect(component(fixture).skipHeldTime).toBeLessThan(
			SKIP_HOLD_SECONDS,
		);
		expect(counts(fixture).lockedC ?? 0).toBe(0);

		fixture.step(40);
		expect(fixture.ecs.query(SequenceComponent).length).toBe(0);
		expect(counts(fixture).lockedC).toBe(1);
		fixture.dispose();
	});
});
