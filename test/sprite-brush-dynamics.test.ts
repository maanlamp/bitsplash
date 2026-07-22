import { describe, expect, test } from "bun:test";
import {
	effectiveBrushSize,
	effectiveOpacityScale,
	effectivePressure,
	pressureToOpacity,
	pressureToSize,
} from "../src/editor/sprite/brush-dynamics";
import { SpriteEditorState } from "../src/editor/sprite/sprite-editor-state";

describe("effective pressure", () => {
	test("zero pressure (no info) is treated as full", () => {
		expect(effectivePressure(0)).toBe(1);
		expect(effectivePressure(-1)).toBe(1);
	});

	test("a real pressure passes through, clamped to 0..1", () => {
		expect(effectivePressure(0.5)).toBe(0.5);
		expect(effectivePressure(1)).toBe(1);
		expect(effectivePressure(1.5)).toBe(1);
	});
});

describe("pressure → size", () => {
	test("full pressure keeps the base size; half halves it", () => {
		expect(pressureToSize(8, 1)).toBe(8);
		expect(pressureToSize(8, 0.5)).toBe(4);
	});

	test("size never drops below a single pixel", () => {
		expect(pressureToSize(8, 0.01)).toBe(1);
		expect(pressureToSize(3, 0)).toBe(1);
	});
});

describe("pressure → opacity", () => {
	test("scales the base opacity linearly", () => {
		expect(pressureToOpacity(1, 0.5)).toBe(0.5);
		expect(pressureToOpacity(0.8, 0.5)).toBeCloseTo(0.4, 5);
	});
});

describe("state-driven dynamics", () => {
	test("size dynamics are inert unless the toggle is on", () => {
		const state = new SpriteEditorState();
		state.setBrushSize(8);
		expect(effectiveBrushSize(state, 0.25)).toBe(8);
		state.setPressureSize(true);
		expect(effectiveBrushSize(state, 0.25)).toBe(2);
	});

	test("a mouse (pressure 0) paints full size even with the toggle on", () => {
		const state = new SpriteEditorState();
		state.setBrushSize(8);
		state.setPressureSize(true);
		expect(effectiveBrushSize(state, 0)).toBe(8);
	});

	test("opacity dynamics are inert unless the toggle is on", () => {
		const state = new SpriteEditorState();
		expect(effectiveOpacityScale(state, 0.5)).toBe(1);
		state.setPressureOpacity(true);
		expect(effectiveOpacityScale(state, 0.5)).toBe(0.5);
		expect(effectiveOpacityScale(state, 0)).toBe(1);
	});
});
