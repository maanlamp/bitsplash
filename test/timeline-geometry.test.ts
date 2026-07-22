import { describe, expect, test } from "bun:test";
import {
	frameColumnAt,
	resizeTagRange,
	tagBarSpan,
} from "../src/editor/sprite/timeline-geometry";

describe("tagBarSpan", () => {
	test("an inclusive [from,to] range spans to-from+1 columns from column `from`", () => {
		expect(tagBarSpan(0, 0)).toEqual({
			startColumn: 0,
			columnSpan: 1,
		});
		expect(tagBarSpan(2, 5)).toEqual({
			startColumn: 2,
			columnSpan: 4,
		});
	});
});

describe("frameColumnAt", () => {
	test("maps an offset to its column, clamped to the frame range", () => {
		expect(frameColumnAt(0, 50, 4)).toBe(0);
		expect(frameColumnAt(75, 50, 4)).toBe(1);
		expect(frameColumnAt(-20, 50, 4)).toBe(0);
		expect(frameColumnAt(1000, 50, 4)).toBe(3);
	});

	test("degenerate tracks return 0", () => {
		expect(frameColumnAt(120, 0, 4)).toBe(0);
		expect(frameColumnAt(120, 50, 0)).toBe(0);
	});
});

describe("resizeTagRange", () => {
	test("dragging the `from` edge moves the start, clamped to bounds", () => {
		expect(resizeTagRange(2, 5, "from", 3, 8)).toEqual({
			from: 3,
			to: 5,
		});
		expect(resizeTagRange(2, 5, "from", -4, 8)).toEqual({
			from: 0,
			to: 5,
		});
	});

	test("dragging the `to` edge moves the end, clamped to the last frame", () => {
		expect(resizeTagRange(2, 5, "to", 4, 8)).toEqual({
			from: 2,
			to: 4,
		});
		expect(resizeTagRange(2, 5, "to", 99, 8)).toEqual({
			from: 2,
			to: 7,
		});
	});

	test("dragging an edge past the opposite one collapses to a single frame rather than inverting", () => {
		expect(resizeTagRange(2, 5, "from", 9, 8)).toEqual({
			from: 5,
			to: 5,
		});
		expect(resizeTagRange(2, 5, "to", 0, 8)).toEqual({
			from: 2,
			to: 2,
		});
	});
});
