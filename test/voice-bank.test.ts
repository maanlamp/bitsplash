import { describe, expect, test } from "bun:test";
import {
	groupSegmentsByVowel,
	VOWEL_COUNT,
	vowelIndexForChar,
} from "../src/game/dialogue/voice-bank";
import type { VoicedSegment } from "../src/game/dialogue/voiced-segments";

const seg = (offset: number): VoicedSegment => ({
	offset,
	duration: 0.2,
});

describe("vowelIndexForChar", () => {
	test("maps the five vowels to distinct indices, case-insensitive", () => {
		expect(vowelIndexForChar("a")).toBe(0);
		expect(vowelIndexForChar("A")).toBe(0);
		expect(vowelIndexForChar("e")).toBe(1);
		expect(vowelIndexForChar("i")).toBe(2);
		expect(vowelIndexForChar("o")).toBe(3);
		expect(vowelIndexForChar("u")).toBe(4);
	});

	test("maps consonants deterministically within range", () => {
		for (const c of "bcdfghjklmnpqrstvwxyz") {
			const idx = vowelIndexForChar(c);
			expect(idx).toBeGreaterThanOrEqual(0);
			expect(idx).toBeLessThan(VOWEL_COUNT);
			expect(vowelIndexForChar(c)).toBe(idx);
		}
	});

	test("falls back to 0 for non-letters", () => {
		expect(vowelIndexForChar("1")).toBe(0);
		expect(vowelIndexForChar("!")).toBe(0);
	});
});

describe("groupSegmentsByVowel", () => {
	test("one take: each vowel gets one segment in order", () => {
		const vowels = groupSegmentsByVowel([0, 1, 2, 3, 4].map(seg));
		expect(vowels.map((v) => v.length)).toEqual([1, 1, 1, 1, 1]);
		expect(vowels[2]![0]!.offset).toBe(2);
	});

	test("repeated sequences group as takes per vowel", () => {
		const vowels = groupSegmentsByVowel(
			Array.from({ length: 10 }, (_, i) => seg(i)),
		);
		expect(vowels.map((v) => v.length)).toEqual([2, 2, 2, 2, 2]);
		expect(vowels[0]!.map((s) => s.offset)).toEqual([0, 5]);
	});

	test("always returns five buckets even when empty", () => {
		expect(groupSegmentsByVowel([]).length).toBe(VOWEL_COUNT);
	});
});
