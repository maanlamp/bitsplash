import { describe, expect, test } from "bun:test";
import {
	adjacentLayerId,
	clampedIndex,
} from "../src/editor/sprite/timeline-navigation";

describe("clampedIndex", () => {
	test("steps within range", () => {
		expect(clampedIndex(2, 1, 5)).toBe(3);
		expect(clampedIndex(2, -1, 5)).toBe(1);
	});

	test("clamps at both ends (no wrap)", () => {
		expect(clampedIndex(0, -1, 5)).toBe(0);
		expect(clampedIndex(4, 1, 5)).toBe(4);
	});

	test("returns the index unchanged for an empty collection", () => {
		expect(clampedIndex(0, 1, 0)).toBe(0);
		expect(clampedIndex(3, -1, 0)).toBe(3);
	});
});

describe("adjacentLayerId (display order, top-first)", () => {
	const display = ["top", "mid", "bottom"];

	test("up moves to the layer shown above", () => {
		expect(adjacentLayerId(display, "mid", -1)).toBe("top");
		expect(adjacentLayerId(display, "bottom", -1)).toBe("mid");
	});

	test("down moves to the layer shown below", () => {
		expect(adjacentLayerId(display, "top", 1)).toBe("mid");
		expect(adjacentLayerId(display, "mid", 1)).toBe("bottom");
	});

	test("clamps at the ends", () => {
		expect(adjacentLayerId(display, "top", -1)).toBe("top");
		expect(adjacentLayerId(display, "bottom", 1)).toBe("bottom");
	});

	test("returns current id when unknown or list empty", () => {
		expect(adjacentLayerId(display, "ghost", 1)).toBe("ghost");
		expect(adjacentLayerId([], "top", 1)).toBe("top");
	});
});
