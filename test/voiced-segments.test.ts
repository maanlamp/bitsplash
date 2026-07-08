import { describe, expect, test } from "bun:test";
import { detectVoicedSegments } from "../src/game/dialogue/voiced-segments";

const SR = 48000;

const buildBuffer = (
	totalSeconds: number,
	bursts: ReadonlyArray<{ start: number; duration: number }>,
): Float32Array => {
	const samples = new Float32Array(Math.floor(totalSeconds * SR));
	for (const { start, duration } of bursts) {
		const from = Math.floor(start * SR);
		const to = Math.floor((start + duration) * SR);
		for (let i = from; i < to && i < samples.length; i++) {
			samples[i] =
				0.5 * Math.sin((2 * Math.PI * 220 * (i - from)) / SR);
		}
	}
	return samples;
};

describe("detectVoicedSegments", () => {
	test("finds five separated bursts with correct timing", () => {
		const bursts = [
			{ start: 0.7, duration: 0.23 },
			{ start: 1.25, duration: 0.32 },
			{ start: 1.83, duration: 0.27 },
			{ start: 2.37, duration: 0.29 },
			{ start: 2.97, duration: 0.27 },
		];
		const segments = detectVoicedSegments(
			buildBuffer(4.0, bursts),
			SR,
		);

		expect(segments.length).toBe(5);
		segments.forEach((seg, i) => {
			expect(seg.offset).toBeCloseTo(bursts[i]!.start, 1);
			expect(seg.duration).toBeCloseTo(bursts[i]!.duration, 1);
		});
	});

	test("returns nothing for pure silence", () => {
		expect(detectVoicedSegments(new Float32Array(SR), SR)).toEqual(
			[],
		);
	});

	test("does not split a burst that has a gap shorter than minGap", () => {
		const bursts = [
			{ start: 0.5, duration: 0.2 },
			{ start: 0.72, duration: 0.2 },
		];
		const segments = detectVoicedSegments(
			buildBuffer(1.5, bursts),
			SR,
			{
				minGapMs: 50,
			},
		);
		expect(segments.length).toBe(1);
	});

	test("splits bursts separated by a gap longer than minGap", () => {
		const bursts = [
			{ start: 0.5, duration: 0.2 },
			{ start: 0.9, duration: 0.2 },
		];
		const segments = detectVoicedSegments(
			buildBuffer(1.5, bursts),
			SR,
			{
				minGapMs: 50,
			},
		);
		expect(segments.length).toBe(2);
	});
});
