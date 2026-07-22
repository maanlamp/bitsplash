import { describe, expect, test } from "bun:test";
import type { BspriteTag } from "../src/engine/sprite/bsprite-manifest";
import {
	type PlaybackState,
	type PreviewRange,
	activePreviewRange,
	advancePreview,
} from "../src/editor/sprite/preview-playback";

const START = (from: number): PlaybackState => ({
	frame: from,
	elapsed: 0,
	finished: false,
});

const run = (
	durations: readonly number[],
	range: PreviewRange,
	steps: readonly number[],
): PlaybackState[] => {
	let state = START(range.from);
	const out: PlaybackState[] = [];
	for (const dt of steps) {
		state = advancePreview(state, dt, durations, range);
		out.push(state);
	}
	return out;
};

const range = (
	from: number,
	to: number,
	loop: boolean,
): PreviewRange => ({ from, to, loop, name: null });

describe("activePreviewRange", () => {
	const tags: BspriteTag[] = [
		{ name: "run", from: 0, to: 1, loop: true },
		{ name: "land", from: 2, to: 4, loop: false },
	];

	test("picks the tag containing the active frame", () => {
		expect(activePreviewRange(3, tags, 5)).toEqual({
			from: 2,
			to: 4,
			loop: false,
			name: "land",
		});
	});

	test("falls back to the whole document (looping) when no tag applies", () => {
		expect(activePreviewRange(0, [], 5)).toEqual({
			from: 0,
			to: 4,
			loop: true,
			name: null,
		});
	});
});

describe("advancePreview", () => {
	test("looping range advances by per-frame durations and wraps", () => {
		const r = range(0, 1, true);
		const frames = run([50, 200], r, [0, 49, 1, 199, 1]).map(
			(s) => s.frame,
		);
		expect(frames).toEqual([0, 0, 1, 1, 0]);
	});

	test("frame is the absolute index within the range", () => {
		const r = range(2, 3, true);
		const frames = run([100, 100, 100, 100], r, [0, 100, 100]).map(
			(s) => s.frame,
		);
		expect(frames).toEqual([2, 3, 2]);
	});

	test("non-looping range clamps at the last frame and sets finished", () => {
		const r = range(0, 2, false);
		const states = run([100, 100, 100], r, [0, 100, 100, 100000]);
		expect(states.map((s) => [s.frame, s.finished])).toEqual([
			[0, false],
			[1, false],
			[2, true],
			[2, true],
		]);
	});

	test("a single-frame range holds and never advances", () => {
		const r = range(2, 2, true);
		const states = run([100, 100, 100], r, [0, 100000]);
		expect(states.map((s) => s.frame)).toEqual([2, 2]);
		expect(states.every((s) => !s.finished)).toBe(true);
	});

	test("a cursor outside the range snaps back to its start", () => {
		const out = advancePreview(
			{ frame: 9, elapsed: 0, finished: false },
			0,
			[100, 100, 100],
			range(0, 2, true),
		);
		expect(out.frame).toBe(0);
	});

	test("a zero-duration frame never advances (no spin)", () => {
		const out = advancePreview(
			START(0),
			100000,
			[0, 100],
			range(0, 1, true),
		);
		expect(out.frame).toBe(0);
	});
});
