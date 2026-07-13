import { expect, test } from "bun:test";
import { detectGamepadType } from "../src/engine/input/detect-gamepad-type";

test("detects Xbox controllers by name and vendor id", () => {
	expect(
		detectGamepadType("Xbox Wireless Controller", "standard"),
	).toBe("xbox");
	expect(
		detectGamepadType("045e-02fd-Wireless Controller", "standard"),
	).toBe("xbox");
	expect(detectGamepadType("XInput Gamepad", "")).toBe("xbox");
});

test("detects PlayStation controllers", () => {
	expect(
		detectGamepadType("DualSense Wireless Controller", "standard"),
	).toBe("playstation");
	expect(detectGamepadType("054c-0ce6-DualSense", "")).toBe(
		"playstation",
	);
	expect(detectGamepadType("Sony DualShock 4", "standard")).toBe(
		"playstation",
	);
});

test("detects Nintendo Switch controllers", () => {
	expect(detectGamepadType("Pro Controller", "standard")).toBe(
		"switch",
	);
	expect(detectGamepadType("057e-2009-Pro Controller", "")).toBe(
		"switch",
	);
	expect(detectGamepadType("Nintendo Switch Joy-Con", "")).toBe(
		"switch",
	);
});

test("falls back to generic for unknown ids and bare standard mapping", () => {
	expect(detectGamepadType("Unknown Gamepad", "standard")).toBe(
		"generic",
	);
	expect(detectGamepadType("", "standard")).toBe("generic");
	expect(detectGamepadType("", "")).toBe("generic");
});
