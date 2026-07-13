import { expect, test } from "bun:test";
import { expandBindings } from "../src/engine/input/bindings/ref-expansion";
import { resolveInputGlyph } from "../src/game/ui/input-glyph-resolver";

const expansion = expandBindings([
	{
		action: "interact",
		source: { kind: "tokens", tokens: ["kbd:E"] },
		activation: "press",
	},
	{
		action: "attack",
		source: { kind: "tokens", tokens: ["mouse:left"] },
		activation: "whileHeld",
	},
	{
		action: "attack",
		source: { kind: "tokens", tokens: ["pad0:north"] },
		activation: "press",
	},
	{
		action: "jump",
		source: { kind: "tokens", tokens: ["pad0:south"] },
		activation: "press",
	},
	{
		action: "dual",
		source: { kind: "tokens", tokens: ["mouse:left"] },
		activation: "press",
	},
	{
		action: "dual",
		source: { kind: "tokens", tokens: ["kbd:F"] },
		activation: "press",
	},
]);

test("mkb keyboard token → readable text label", () => {
	expect(
		resolveInputGlyph(
			expansion,
			{ kind: "mkb", padSlot: null },
			"generic",
			"interact",
		),
	).toEqual({ activation: "press", kind: "text", text: "E" });
});

test("mkb mouse-only action → mouse label, whileHeld maps to hold", () => {
	expect(
		resolveInputGlyph(
			expansion,
			{ kind: "mkb", padSlot: null },
			"generic",
			"attack",
		),
	).toEqual({ activation: "hold", kind: "text", text: "LMB" });
});

test("mkb prefers the keyboard binding over the mouse binding", () => {
	expect(
		resolveInputGlyph(
			expansion,
			{ kind: "mkb", padSlot: null },
			"generic",
			"dual",
		),
	).toEqual({ activation: "press", kind: "text", text: "F" });
});

test("branded gamepad token → icon cell", () => {
	expect(
		resolveInputGlyph(
			expansion,
			{ kind: "gamepad", padSlot: "0" },
			"xbox",
			"jump",
		),
	).toEqual({
		activation: "press",
		kind: "icon",
		icon: { family: "xbox", index: 0 },
	});
});

test("generic gamepad token → textual button number", () => {
	expect(
		resolveInputGlyph(
			expansion,
			{ kind: "gamepad", padSlot: "0" },
			"generic",
			"jump",
		),
	).toEqual({ activation: "press", kind: "text", text: "B1" });
});

test("picks the binding matching the active device kind", () => {
	expect(
		resolveInputGlyph(
			expansion,
			{ kind: "gamepad", padSlot: "0" },
			"playstation",
			"attack",
		),
	).toEqual({
		activation: "press",
		kind: "icon",
		icon: { family: "playstation", index: 3 },
	});
});

test("falls back to the first binding when no device match exists", () => {
	expect(
		resolveInputGlyph(
			expansion,
			{ kind: "gamepad", padSlot: "0" },
			"xbox",
			"interact",
		)?.text,
	).toBe("E");
});
