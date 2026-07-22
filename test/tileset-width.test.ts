import { describe, expect, test } from "bun:test";
import {
	SHEET_COLUMNS,
	isValidTilesetWidth,
	snapTilesetWidth,
} from "../src/engine/tilemap/autotile";

describe("isValidTilesetWidth", () => {
	test("accepts positive exact multiples of the column count", () => {
		expect(isValidTilesetWidth(SHEET_COLUMNS)).toBe(true);
		expect(isValidTilesetWidth(96)).toBe(true);
		expect(isValidTilesetWidth(48)).toBe(true);
	});

	test("rejects non-multiples, zero, negatives, and non-integers", () => {
		expect(isValidTilesetWidth(95)).toBe(false);
		expect(isValidTilesetWidth(97)).toBe(false);
		expect(isValidTilesetWidth(0)).toBe(false);
		expect(isValidTilesetWidth(-3)).toBe(false);
		expect(isValidTilesetWidth(1.5)).toBe(false);
	});
});

describe("snapTilesetWidth", () => {
	test("snaps to the nearest multiple, never below one column", () => {
		expect(snapTilesetWidth(96)).toBe(96);
		expect(snapTilesetWidth(95)).toBe(96);
		expect(snapTilesetWidth(97)).toBe(96);
		expect(snapTilesetWidth(1)).toBe(SHEET_COLUMNS);
		expect(snapTilesetWidth(0)).toBe(SHEET_COLUMNS);
	});

	test("always produces a valid width", () => {
		for (let w = -5; w <= 200; w++) {
			expect(isValidTilesetWidth(snapTilesetWidth(w))).toBe(true);
		}
	});
});
