import { describe, expect, test } from "bun:test";
import { paletteColor } from "../src/editor/sprite/palette-color";
import { shadeColor } from "../src/editor/sprite/palette-shading";

const DARK = paletteColor(20, 20, 20);
const MID = paletteColor(120, 120, 120);
const LIGHT = paletteColor(230, 230, 230);
const RAMP = [DARK, MID, LIGHT];

describe("shading colour shift", () => {
	test("forward steps to the next colour in palette order", () => {
		expect(shadeColor(RAMP, DARK, "forward")).toEqual(MID);
		expect(shadeColor(RAMP, MID, "forward")).toEqual(LIGHT);
	});

	test("backward steps to the previous colour", () => {
		expect(shadeColor(RAMP, LIGHT, "backward")).toEqual(MID);
		expect(shadeColor(RAMP, MID, "backward")).toEqual(DARK);
	});

	test("ramp ends stop (no wrap)", () => {
		expect(shadeColor(RAMP, LIGHT, "forward")).toBeNull();
		expect(shadeColor(RAMP, DARK, "backward")).toBeNull();
	});

	test("an off-palette colour is left unchanged (null)", () => {
		expect(
			shadeColor(RAMP, paletteColor(1, 2, 3), "forward"),
		).toBeNull();
	});

	test("a single-colour palette never shifts", () => {
		expect(shadeColor([MID], MID, "forward")).toBeNull();
		expect(shadeColor([MID], MID, "backward")).toBeNull();
	});

	test("an empty palette shifts nothing", () => {
		expect(shadeColor([], MID, "forward")).toBeNull();
	});
});
