import { describe, expect, test } from "bun:test";
import {
	BAYER_4X4,
	ditherMask,
	ditherThreshold,
} from "../src/editor/sprite/dither";

describe("bayer matrix", () => {
	test("is a 4×4 permutation of 0..15", () => {
		const flat = BAYER_4X4.flat().sort((a, b) => a - b);
		expect(flat).toEqual(Array.from({ length: 16 }, (_, i) => i));
	});
});

describe("dither threshold", () => {
	test("lies strictly inside (0, 1) and tiles every 4 cells", () => {
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				const t = ditherThreshold(x, y);
				expect(t).toBeGreaterThan(0);
				expect(t).toBeLessThan(1);
				expect(ditherThreshold(x + 4, y + 8)).toBeCloseTo(t, 12);
			}
		}
	});

	test("is stable for negative coordinates (seamless tiling)", () => {
		expect(ditherThreshold(-1, -1)).toBeCloseTo(
			ditherThreshold(3, 3),
			12,
		);
	});
});

describe("dither mask", () => {
	test("0% density paints nothing; 100% paints everything", () => {
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				expect(ditherMask(x, y, 0)).toBe(false);
				expect(ditherMask(x, y, 1)).toBe(true);
			}
		}
	});

	test("coverage rises monotonically with density", () => {
		const coverage = (d: number): number => {
			let on = 0;
			for (let y = 0; y < 4; y++) {
				for (let x = 0; x < 4; x++) {
					if (ditherMask(x, y, d)) {
						on++;
					}
				}
			}
			return on;
		};
		expect(coverage(0.25)).toBeLessThan(coverage(0.5));
		expect(coverage(0.5)).toBeLessThan(coverage(0.75));
		expect(coverage(0.5)).toBe(8);
	});
});
