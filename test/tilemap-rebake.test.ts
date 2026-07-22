import { describe, expect, test } from "bun:test";
import { tileBatchNeedsRebake } from "../src/engine/tilemap/tilemap-render-system";

describe("tileBatchNeedsRebake", () => {
	test("no rebake when the grid version and rows are unchanged", () => {
		expect(tileBatchNeedsRebake({ version: 5, rows: 3 }, 5, 3)).toBe(
			false,
		);
	});

	test("rebakes when the grid version changed", () => {
		expect(tileBatchNeedsRebake({ version: 5, rows: 3 }, 6, 3)).toBe(
			true,
		);
	});

	test("rebakes when the tile-array row count changed (hot reload)", () => {
		expect(tileBatchNeedsRebake({ version: 5, rows: 3 }, 5, 4)).toBe(
			true,
		);
	});

	test("a fresh entry (version -1, rows -1) always rebakes on first poll", () => {
		expect(
			tileBatchNeedsRebake({ version: -1, rows: -1 }, 0, 1),
		).toBe(true);
	});
});
