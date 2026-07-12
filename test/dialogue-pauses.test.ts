import { describe, expect, test } from "bun:test";
import {
	computePauses,
	type DialogueBindings,
} from "../src/engine/dialogue/dialogue-system";

const bindings = {
	commaPauseChars: 8,
	midPauseChars: 13,
	stopPauseChars: 20,
	ellipsisPauseChars: 26,
} as unknown as DialogueBindings;

const pausesOf = (text: string): number[] =>
	computePauses(Array.from(text), bindings);

describe("computePauses", () => {
	test("comma, mid, and stop tiers pause after their mark", () => {
		expect(pausesOf("a, b")).toEqual([0, 8, 0, 0]);
		expect(pausesOf("a; b")).toEqual([0, 13, 0, 0]);
		expect(pausesOf("a: b")).toEqual([0, 13, 0, 0]);
		expect(pausesOf("Hi.")).toEqual([0, 0, 20]);
	});

	test("dashes share the comma tier", () => {
		expect(pausesOf("a—b")).toEqual([0, 8, 0]);
		expect(pausesOf("a–b")).toEqual([0, 8, 0]);
	});

	test("ellipsis collapses to a single longer pause", () => {
		expect(pausesOf("no...")).toEqual([0, 0, 0, 0, 26]);
	});

	test("mixed sentence-enders collapse to one stop pause", () => {
		expect(pausesOf("what?!")).toEqual([0, 0, 0, 0, 0, 20]);
	});

	test("plain text has no pauses", () => {
		expect(pausesOf("hello")).toEqual([0, 0, 0, 0, 0]);
	});
});
