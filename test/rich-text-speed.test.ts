import { describe, expect, test } from "bun:test";
import { parseRichText } from "../src/engine/text/rich-text";

const speeds = (src: string): number[] =>
	parseRichText(src).map((c) => c.style.speed);

describe("rich-text speed tag", () => {
	test("defaults to 1 with no tag", () => {
		expect(speeds("abc")).toEqual([1, 1, 1]);
	});

	test("applies a multiplier inside the span only", () => {
		expect(speeds("a<speed=0.5>b</speed>c")).toEqual([1, 0.5, 1]);
	});

	test("nested spans multiply", () => {
		expect(speeds("<speed=2><speed=0.5>x</speed></speed>")).toEqual([
			1,
		]);
	});

	test("ignores non-positive or invalid factors", () => {
		expect(speeds("<speed=0>x</speed>")).toEqual([1]);
		expect(speeds("<speed=nope>x</speed>")).toEqual([1]);
	});
});
