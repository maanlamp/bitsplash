import { describe, expect, test } from "bun:test";
import { objectiveComplete } from "../src/game/quest/quest-system";

describe("quest objective completion", () => {
	test("a zero goal is never complete (pickup-tour early-resolve bug)", () => {
		expect(objectiveComplete(0, 0)).toBe(false);
	});

	test("progress below a seeded goal is not complete", () => {
		expect(objectiveComplete(2, 4)).toBe(false);
	});

	test("reaching or exceeding a positive goal is complete", () => {
		expect(objectiveComplete(4, 4)).toBe(true);
		expect(objectiveComplete(5, 4)).toBe(true);
	});
});
