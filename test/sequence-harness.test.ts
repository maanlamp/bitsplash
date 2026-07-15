import { describe, expect, test } from "bun:test";
import {
	counterHarnessConfig,
	HarnessCounterComponent,
} from "./support/counter-fixture";
import { SequenceFixture } from "./support/sequence-harness";

describe("sequence harness scaffold", () => {
	const persistentTicks = (fixture: SequenceFixture): number => {
		const counters = fixture.ecs.query(HarnessCounterComponent);
		return Math.max(...counters.map(([, c]) => c.ticks));
	};

	test("boots a headless runtime and steps a real system", async () => {
		const fixture = await SequenceFixture.create(
			counterHarnessConfig,
		);
		fixture.step(5);
		expect(persistentTicks(fixture)).toBe(5);
		fixture.dispose();
	});

	test("state survives capture -> fresh runtime -> restore", async () => {
		const fixture = await SequenceFixture.create(
			counterHarnessConfig,
		);
		fixture.step(10);
		expect(persistentTicks(fixture)).toBe(10);

		await fixture.saveAndReload();
		expect(persistentTicks(fixture)).toBe(10);

		fixture.step(3);
		expect(persistentTicks(fixture)).toBe(13);
		fixture.dispose();
	});
});
