import { describe, expect, test } from "bun:test";
import { ECS } from "../src/engine/ecs";
import { FrameProfile } from "../src/engine/profiling/frame-profile";
import { profiler } from "../src/engine/profiling/profiler";
import {
	type UpdateContext,
	UpdateSystem,
} from "../src/engine/system";

@profiler("Alpha", "Physics")
class AlphaSystem extends UpdateSystem {
	update(): void {
		let n = 0;
		for (let i = 0; i < 1000; i++) {
			n += i;
		}
		void n;
	}
}

@profiler("Beta", "AI")
class BetaSystem extends UpdateSystem {
	update(): void {}
}

const ctx = {} as unknown as UpdateContext;

describe("FrameProfile instrumentation", () => {
	test("records per-instance labels, suffixes duplicates, resets per frame", () => {
		const ecs = new ECS();
		const profile = new FrameProfile();
		const betaB = new BetaSystem();
		ecs.addUpdateSystem(new AlphaSystem());
		ecs.addUpdateSystem(new BetaSystem());
		ecs.addUpdateSystem(betaB);
		ecs.setProfile(profile);

		ecs.update(ctx);

		const timings = profile.systemTimings;
		expect([...timings.keys()].sort()).toEqual([
			"Alpha",
			"Beta",
			"Beta#2",
		]);
		expect(profile.groupOf("Alpha")).toBe("Physics");
		expect(profile.groupOf("Beta#2")).toBe("AI");

		let sum = 0;
		for (const ms of timings.values()) {
			expect(ms).toBeGreaterThanOrEqual(0);
			sum += ms;
		}
		expect(profile.updateSpanMs).toBeGreaterThanOrEqual(sum);

		ecs.removeUpdateSystem(betaB);
		ecs.update(ctx);

		expect([...profile.systemTimings.keys()].sort()).toEqual([
			"Alpha",
			"Beta",
		]);
		expect(profile.systemTimings.has("Beta#2")).toBe(false);
	});

	test("disabled profile leaves the loop untimed", () => {
		const ecs = new ECS();
		const profile = new FrameProfile();
		ecs.addUpdateSystem(new AlphaSystem());
		ecs.setProfile(profile);
		ecs.update(ctx);
		expect(profile.systemTimings.size).toBe(1);

		ecs.setProfile(null);
		profile.reset();
		ecs.update(ctx);
		expect(profile.systemTimings.size).toBe(0);
		expect(profile.updateSpanMs).toBe(0);
	});
});
