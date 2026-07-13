import { expect, test } from "bun:test";
import type {
	ActionCatalog,
	Binding,
} from "../src/engine/input/bindings/action-catalog";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import type { GamepadState } from "../src/engine/input/gamepad";
import {
	ActionResolver,
	SETTINGS_KEYS,
} from "../src/engine/input/bindings/action-resolver";
import { MemorySettingsStore } from "../src/engine/input/bindings/memory-settings-store";
import { token } from "../src/engine/input/edge-detector";

type SnapshotSpec = { keys?: string[]; mouse?: string[] };

const snapshot = (spec: SnapshotSpec): DeviceSnapshot => {
	const keys: Record<string, boolean> = {};
	for (const key of spec.keys ?? []) {
		keys[key] = true;
	}
	const buttons: Record<string, boolean> = {};
	for (const button of spec.mouse ?? []) {
		buttons[button] = true;
	}
	const gamepads: Record<string, GamepadState> = {};
	return {
		keyboard: { keys },
		mouse: {
			buttons,
			position: { x: 0, y: 0 },
			wheel: { x: 0, y: 0 },
		},
		gamepads,
	};
};

const tokens = (...t: string[]): Binding["source"] => ({
	kind: "tokens",
	tokens: t,
});
const ref = (action: string): Binding["source"] => ({
	kind: "ref",
	action,
});
const chord = (...t: string[]): Binding["source"] => ({
	kind: "chord",
	tokens: t,
});

const catalog: ActionCatalog = {
	actions: [
		{ id: "interact", kind: "discrete", essential: false },
		{ id: "jump", kind: "discrete", essential: true },
		{ id: "special", kind: "discrete", essential: false },
		{ id: "quick", kind: "discrete", essential: false },
		{ id: "combo", kind: "discrete", essential: false },
		{ id: "dash", kind: "continuous", essential: false },
		{ id: "sprint", kind: "continuous", essential: false },
		{ id: "dialogue.advance", kind: "discrete", essential: false },
		{
			id: "dialogue.fastforward",
			kind: "continuous",
			essential: false,
		},
	],
	contexts: ["gameplay", "dialogue", "menu"],
	defaults: [
		{
			action: "interact",
			source: tokens(token.keyboard("E")),
			activation: "press",
		},
		{
			action: "jump",
			source: tokens(token.keyboard("SPACE")),
			activation: "press",
		},
		{
			action: "special",
			source: tokens(token.keyboard("F")),
			activation: "hold",
		},
		{
			action: "quick",
			source: tokens(token.keyboard("Q")),
			activation: "doubleTap",
		},
		{
			action: "combo",
			source: chord(token.keyboard("CTRL"), token.keyboard("B")),
			activation: "press",
		},
		{
			action: "dash",
			source: tokens(token.keyboard("SHIFT")),
			activation: "toggle",
		},
		{
			action: "sprint",
			source: tokens(token.keyboard("ALT")),
			activation: "whileHeld",
		},
		{
			action: "dialogue.advance",
			source: ref("interact"),
			activation: "press",
		},
		{
			action: "dialogue.fastforward",
			source: tokens(token.keyboard("E")),
			activation: "whileHeld",
		},
	],
	coexist: [],
};

const make = (): {
	resolver: ActionResolver;
	store: MemorySettingsStore;
} => {
	const store = new MemorySettingsStore();
	const resolver = new ActionResolver(catalog, store);
	return { resolver, store };
};

test("press fires exactly one frame on the down edge", () => {
	const { resolver } = make();
	resolver.step(snapshot({}), 16);
	expect(resolver.fired("interact")).toBe(false);

	resolver.step(snapshot({ keys: ["E"] }), 16);
	expect(resolver.fired("interact")).toBe(true);
	expect(resolver.firedCount("interact")).toBe(1);

	resolver.step(snapshot({ keys: ["E"] }), 16);
	expect(resolver.fired("interact")).toBe(false);
});

test("ref-expanded action fires as a peer of its target", () => {
	const { resolver } = make();
	resolver.step(snapshot({ keys: ["E"] }), 16);
	expect(resolver.fired("interact")).toBe(true);
	expect(resolver.fired("dialogue.advance")).toBe(true);
});

test("consume blocks peers sharing the token for the rest of the step", () => {
	const { resolver } = make();
	resolver.step(snapshot({ keys: ["E"] }), 16);
	expect(resolver.fired("dialogue.advance")).toBe(true);
	resolver.consume("dialogue.advance");
	expect(resolver.fired("dialogue.advance")).toBe(false);
	expect(resolver.fired("interact")).toBe(false);
});

test("hold crosses the threshold once", () => {
	const { resolver, store } = make();
	store.set(SETTINGS_KEYS.holdThresholdMs, "50");
	resolver.step(snapshot({ keys: ["F"] }), 100);
	expect(resolver.fired("special")).toBe(false);
	resolver.step(snapshot({ keys: ["F"] }), 100);
	expect(resolver.fired("special")).toBe(true);
	resolver.step(snapshot({ keys: ["F"] }), 100);
	expect(resolver.fired("special")).toBe(false);
});

test("doubleTap fires on the second press inside the window", () => {
	const { resolver, store } = make();
	store.set(SETTINGS_KEYS.doubleTapWindowMs, "100");
	resolver.step(snapshot({ keys: ["Q"] }), 16);
	expect(resolver.fired("quick")).toBe(false);
	resolver.step(snapshot({}), 16);
	resolver.step(snapshot({ keys: ["Q"] }), 16);
	expect(resolver.fired("quick")).toBe(true);
});

test("toggle latches flip on each press and merge with the continuous read", () => {
	const { resolver } = make();
	resolver.step(snapshot({ keys: ["SHIFT"] }), 16);
	expect(resolver.active("dash")).toBe(true);
	resolver.step(snapshot({}), 16);
	expect(resolver.active("dash")).toBe(true);
	resolver.step(snapshot({ keys: ["SHIFT"] }), 16);
	expect(resolver.active("dash")).toBe(false);
});

test("whileHeld continuous is active only while the token is down", () => {
	const { resolver } = make();
	resolver.step(snapshot({ keys: ["ALT"] }), 16);
	expect(resolver.active("sprint")).toBe(true);
	resolver.step(snapshot({}), 16);
	expect(resolver.active("sprint")).toBe(false);
});

test("chord fires only when all members are down", () => {
	const { resolver } = make();
	resolver.step(snapshot({ keys: ["CTRL"] }), 16);
	expect(resolver.fired("combo")).toBe(false);
	resolver.step(snapshot({ keys: ["CTRL", "B"] }), 16);
	expect(resolver.fired("combo")).toBe(true);
	resolver.step(snapshot({ keys: ["CTRL", "B"] }), 16);
	expect(resolver.fired("combo")).toBe(false);
});

test("resetEdges swallows the next down edge and clears hold state", () => {
	const { resolver } = make();
	resolver.step(snapshot({ keys: ["E"] }), 16);
	resolver.resetEdges();
	resolver.step(snapshot({ keys: ["E"] }), 16);
	expect(resolver.fired("interact")).toBe(false);
});

test("global allHoldsToToggle converts whileHeld to toggle", () => {
	const { resolver, store } = make();
	store.set(SETTINGS_KEYS.allHoldsToToggle, "true");
	resolver.step(snapshot({ keys: ["ALT"] }), 16);
	expect(resolver.active("sprint")).toBe(true);
	resolver.step(snapshot({}), 16);
	expect(resolver.active("sprint")).toBe(true);
});

test("removing the last binding clears a toggle latch", () => {
	const { resolver } = make();
	resolver.step(snapshot({ keys: ["SHIFT"] }), 16);
	expect(resolver.active("dash")).toBe(true);
	resolver.setBindings(
		catalog.defaults.filter((b) => b.action !== "dash"),
	);
	resolver.step(snapshot({}), 16);
	expect(resolver.active("dash")).toBe(false);
});

test("continuous actions never report fired", () => {
	const { resolver } = make();
	resolver.step(snapshot({ keys: ["ALT"] }), 16);
	expect(resolver.fired("sprint")).toBe(false);
	expect(resolver.firedCount("sprint")).toBe(0);
});
