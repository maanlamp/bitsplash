import { describe, expect, test } from "bun:test";
import {
	PERF_WINDOW,
	PerfHistory,
} from "../src/editor/perf/perf-history";

const push = (history: PerfHistory, frametime: number): void =>
	history.push({ frametime, update: 0, heap: 0, fps: 60, now: 0 });

describe("PerfHistory", () => {
	test("stats and ordered access over a partial window", () => {
		const history = new PerfHistory();
		for (const v of [10, 30, 20]) {
			push(history, v);
		}
		expect(history.length).toBe(3);
		expect(history.sampleAt("frametime", 0)).toBe(10);
		expect(history.sampleAt("frametime", 2)).toBe(20);

		const stats = history.stats("frametime");
		expect(stats.min).toBe(10);
		expect(stats.max).toBe(30);
		expect(stats.avg).toBeCloseTo(20);
		expect(stats.current).toBe(20);
	});

	test("caps at the window and drops oldest samples", () => {
		const history = new PerfHistory();
		for (let i = 0; i < PERF_WINDOW + 5; i++) {
			push(history, i);
		}
		expect(history.length).toBe(PERF_WINDOW);
		// Oldest retained is sample 5; newest is PERF_WINDOW + 4.
		expect(history.sampleAt("frametime", 0)).toBe(5);
		expect(history.sampleAt("frametime", PERF_WINDOW - 1)).toBe(
			PERF_WINDOW + 4,
		);
		expect(history.stats("frametime").current).toBe(PERF_WINDOW + 4);
		expect(history.stats("frametime").min).toBe(5);
	});

	test("empty history reports zeroed stats", () => {
		const stats = new PerfHistory().stats("update");
		expect(stats).toEqual({ min: 0, avg: 0, max: 0, current: 0 });
	});

	test("displayFps latches at most once per second, without averaging", () => {
		const history = new PerfHistory();
		const sample = (fps: number, now: number): void =>
			history.push({ frametime: 0, update: 0, heap: 0, fps, now });

		sample(1000, 0);
		expect(history.displayFps).toBe(1000);

		// Within the 1s window the readout holds, even as raw fps swings.
		sample(60, 200);
		sample(500, 800);
		expect(history.fps).toBe(500);
		expect(history.displayFps).toBe(1000);

		// Crossing the window latches the current raw value verbatim (no average).
		sample(123, 1000);
		expect(history.displayFps).toBe(123);
	});
});
