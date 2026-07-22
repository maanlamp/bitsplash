import { describe, expect, test } from "bun:test";
import {
	type Rng,
	jitterSize,
	scatterOffsets,
} from "../src/editor/sprite/scatter";

/** A deterministic generator cycling through a fixed sequence of randoms. */
const seeded = (values: ReadonlyArray<number>): Rng => {
	let i = 0;
	return () => values[i++ % values.length]!;
};

describe("scatter offsets", () => {
	test("emits exactly `count` offsets", () => {
		const rng = seeded([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
		expect(scatterOffsets(rng, 5, 4)).toHaveLength(5);
		expect(scatterOffsets(rng, 0, 4)).toHaveLength(0);
	});

	test("every offset stays within the radius (before rounding slack)", () => {
		const rng = Math.random;
		const radius = 6;
		for (const [dx, dy] of scatterOffsets(rng, 500, radius)) {
			// Rounding can push a boundary sample out by at most ~0.71px.
			expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(radius + 1);
		}
	});

	test("a zero radius scatters onto the centre only", () => {
		const rng = Math.random;
		for (const [dx, dy] of scatterOffsets(rng, 20, 0)) {
			expect(dx).toBeCloseTo(0, 10);
			expect(dy).toBeCloseTo(0, 10);
		}
	});

	test("area-uniform sampling puts roughly half the mass inside half-radius²", () => {
		const rng = Math.random;
		const radius = 10;
		const offsets = scatterOffsets(rng, 4000, radius);
		const inner = offsets.filter(
			([dx, dy]) => Math.hypot(dx, dy) <= radius / Math.SQRT2,
		).length;
		// Half the disk area lies within radius/√2; allow generous slack.
		expect(inner / offsets.length).toBeGreaterThan(0.35);
		expect(inner / offsets.length).toBeLessThan(0.65);
	});
});

describe("jitter size", () => {
	test("no jitter keeps the base size", () => {
		expect(jitterSize(() => 0.9, 8, 0)).toBe(8);
	});

	test("full jitter can shrink but never below one pixel", () => {
		expect(jitterSize(() => 1, 8, 1)).toBe(1);
		expect(jitterSize(() => 0.5, 8, 1)).toBe(4);
	});

	test("stays within [floor, base] for any random draw", () => {
		const base = 10;
		const jitter = 0.5;
		for (let i = 0; i <= 10; i++) {
			const size = jitterSize(() => i / 10, base, jitter);
			expect(size).toBeGreaterThanOrEqual(1);
			expect(size).toBeLessThanOrEqual(base);
		}
	});
});
