import { describe, expect, test } from "bun:test";
import { gradientDither } from "../src/editor/sprite/gradient";

const countPerColumn = (
	cells: ReadonlyArray<readonly [number, number]>,
	width: number,
): number[] => {
	const counts = Array.from<number>({ length: width }).fill(0);
	for (const [x] of cells) {
		counts[x] = (counts[x] ?? 0) + 1;
	}
	return counts;
};

describe("dithered gradient", () => {
	test("every cell is assigned to exactly one endpoint", () => {
		const { a, b } = gradientDither(16, 16, 0, 0, 15, 0);
		expect(a.length + b.length).toBe(16 * 16);
	});

	test("start colour dominates at the start, end colour at the end", () => {
		const width = 16;
		const height = 8;
		const { a } = gradientDither(width, height, 0, 0, width - 1, 0);
		const perColumn = countPerColumn(a, width);
		// The first column is all start-colour; the last is all end-colour.
		expect(perColumn[0]).toBe(height);
		expect(perColumn[width - 1]).toBe(0);
	});

	test("start-colour coverage falls along the axis (per Bayer stride)", () => {
		const width = 32;
		const height = 8;
		const { a } = gradientDither(width, height, 0, 0, width - 1, 0);
		const perColumn = countPerColumn(a, width);
		// Columns four apart share a Bayer column, so `t` alone decides — a strictly
		// monotone comparison the per-cell dither jitter cannot violate.
		for (let x = 4; x < width; x++) {
			expect(perColumn[x]!).toBeLessThanOrEqual(perColumn[x - 4]!);
		}
	});

	test("a zero-length axis puts every cell in the start colour", () => {
		const { a, b } = gradientDither(8, 8, 4, 4, 4, 4);
		expect(a.length).toBe(64);
		expect(b.length).toBe(0);
	});

	test("works along an arbitrary (diagonal) axis", () => {
		const { a, b } = gradientDither(10, 10, 0, 0, 9, 9);
		expect(a.length + b.length).toBe(100);
		expect(a.length).toBeGreaterThan(0);
		expect(b.length).toBeGreaterThan(0);
	});
});
