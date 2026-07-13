import { expect, test } from "bun:test";
import {
	analogToButton,
	synthesizeAxis,
	validateAimBinding,
} from "../src/engine/input/aim/aim-binding";

test("legal source/drive combos resolve to an adapter", () => {
	expect(
		validateAimBinding({ source: "pointer", drive: "absolute" }),
	).toBe("none");
	expect(
		validateAimBinding({ source: "analog", drive: "relative" }),
	).toBe("none");
	expect(
		validateAimBinding({ source: "digital", drive: "relative" }),
	).toBe("digitalToAxis");
});

test("illegal source/drive combos are rejected, not silent no-ops", () => {
	expect(() =>
		validateAimBinding({ source: "pointer", drive: "relative" }),
	).toThrow();
	expect(() =>
		validateAimBinding({ source: "analog", drive: "absolute" }),
	).toThrow();
	expect(() =>
		validateAimBinding({ source: "digital", drive: "absolute" }),
	).toThrow();
});

test("digital->axis synthesis maps button pairs to -1/0/1", () => {
	expect(synthesizeAxis(false, false)).toBe(0);
	expect(synthesizeAxis(true, false)).toBe(-1);
	expect(synthesizeAxis(false, true)).toBe(1);
	expect(synthesizeAxis(true, true)).toBe(0);
});

test("analog->button threshold adapter fires past the threshold", () => {
	expect(analogToButton(0.2, 0.5)).toBe(false);
	expect(analogToButton(0.6, 0.5)).toBe(true);
	expect(analogToButton(-0.6, 0.5)).toBe(true);
});
