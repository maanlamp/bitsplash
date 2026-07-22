import { describe, expect, test } from "bun:test";
import type { Cell } from "../src/editor/sprite/shapes";
import {
	StrokeStabilizer,
	stabilizerWeight,
} from "../src/editor/sprite/stroke-stabilizer";

describe("stabilizer weight", () => {
	test("zero and below disable smoothing", () => {
		expect(stabilizerWeight(0)).toBe(0);
		expect(stabilizerWeight(-5)).toBe(0);
	});

	test("scales as a percentage and caps below 1", () => {
		expect(stabilizerWeight(50)).toBeCloseTo(0.5, 5);
		expect(stabilizerWeight(100)).toBe(0.95);
		expect(stabilizerWeight(1000)).toBe(0.95);
	});
});

describe("stroke stabilizer", () => {
	test("weight 0 tracks the pointer exactly (raw stroke)", () => {
		const s = new StrokeStabilizer(0);
		expect(s.begin(3, 4)).toEqual([3, 4]);
		expect(s.push(10, 20)).toEqual([10, 20]);
		expect(s.push(-5, 7)).toEqual([-5, 7]);
	});

	test("a non-zero weight lags behind the target", () => {
		const s = new StrokeStabilizer(50); // weight 0.5, follow 0.5
		s.begin(0, 0);
		expect(s.push(10, 0)).toEqual([5, 0]);
		expect(s.push(10, 0)).toEqual([8, 0]);
	});

	test("smoothed cells never overshoot the target range", () => {
		const s = new StrokeStabilizer(80);
		s.begin(0, 0);
		for (let i = 0; i < 20; i++) {
			const [x] = s.push(100, 0);
			expect(x).toBeGreaterThanOrEqual(0);
			expect(x).toBeLessThanOrEqual(100);
		}
	});

	test("flush eases to and snaps onto the true release point", () => {
		const s = new StrokeStabilizer(90);
		s.begin(0, 0);
		s.push(100, 0);
		const cells = s.flush(100, 0) as Cell[];
		expect(cells.at(-1)).toEqual([100, 0]);
		// The eased tail is monotonic and bounded within the axis.
		for (const [x] of cells) {
			expect(x).toBeGreaterThanOrEqual(0);
			expect(x).toBeLessThanOrEqual(100);
		}
	});

	test("flush terminates even at the maximum weight", () => {
		const s = new StrokeStabilizer(100000);
		s.begin(0, 0);
		const cells = s.flush(500, 500);
		expect(cells.at(-1)).toEqual([500, 500]);
	});
});
