import { describe, expect, test } from "bun:test";
import { MeasureMode } from "yoga-layout";
import { resolveMeasuredWidth } from "../src/engine/ui/layout/measure-text";
import { richTextMarkup } from "../src/engine/ui/components/rich-text";

describe("measure mode resolution", () => {
	test("exactly uses the available width", () => {
		expect(resolveMeasuredWidth(30, 120, MeasureMode.Exactly)).toBe(
			120,
		);
	});

	test("at-most clamps to the smaller of natural and available", () => {
		expect(resolveMeasuredWidth(30, 120, MeasureMode.AtMost)).toBe(
			30,
		);
		expect(resolveMeasuredWidth(200, 120, MeasureMode.AtMost)).toBe(
			120,
		);
	});

	test("undefined returns the natural width", () => {
		expect(resolveMeasuredWidth(30, 120, MeasureMode.Undefined)).toBe(
			30,
		);
	});
});

describe("rich text markup compilation", () => {
	test("plain segment escapes markup characters", () => {
		expect(richTextMarkup([{ text: "a < b & c" }])).toBe(
			"a &lt; b &amp; c",
		);
	});

	test("style flags wrap in nested tags", () => {
		expect(
			richTextMarkup([{ text: "hi", bold: true, italic: true }]),
		).toBe("<b><i>hi</i></b>");
	});

	test("string colour passes through as a tag", () => {
		expect(richTextMarkup([{ text: "x", color: "#ff0000" }])).toBe(
			"<color=#ff0000>x</color>",
		);
	});

	test("rgba colour is encoded as spaceless hex", () => {
		expect(richTextMarkup([{ text: "x", color: [1, 0, 0, 1] }])).toBe(
			"<color=#ff0000ff>x</color>",
		);
	});
});
