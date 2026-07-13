import { expect, test } from "bun:test";
import type {
	ActionCatalog,
	Binding,
} from "../src/engine/input/bindings/action-catalog";
import { expandBindings } from "../src/engine/input/bindings/ref-expansion";
import {
	ConflictDiagnostics,
	DanglingRefDiagnostics,
	EssentialGuard,
} from "../src/engine/input/bindings/bindings-diagnostics";
import { BindingsPersistence } from "../src/engine/input/bindings/settings-persistence";
import { MemorySettingsStore } from "../src/engine/input/bindings/memory-settings-store";
import { token } from "../src/engine/input/edge-detector";

const tokens = (...t: string[]): Binding["source"] => ({
	kind: "tokens",
	tokens: t,
});
const ref = (action: string): Binding["source"] => ({
	kind: "ref",
	action,
});

test("two native owners of one token are a conflict", () => {
	const expansion = expandBindings([
		{
			action: "jump",
			source: tokens(token.keyboard("SPACE")),
			activation: "press",
		},
		{
			action: "confirm",
			source: tokens(token.keyboard("SPACE")),
			activation: "press",
		},
	]);
	const conflicts = new ConflictDiagnostics().compute(expansion);
	expect(conflicts).toHaveLength(1);
	expect(conflicts[0]!.actions).toEqual(["confirm", "jump"]);
});

test("a ref sharing its target token is linked, not conflicting", () => {
	const expansion = expandBindings([
		{
			action: "interact",
			source: tokens(token.keyboard("E")),
			activation: "press",
		},
		{
			action: "advance",
			source: ref("interact"),
			activation: "press",
		},
	]);
	const diag = new ConflictDiagnostics();
	expect(diag.compute(expansion)).toHaveLength(0);
	const linked = diag.linked(expansion);
	expect(linked).toEqual([
		{ referrer: "advance", target: "interact", token: "kbd:E" },
	]);
});

test("essential guard flags actions with no resolved terminal token", () => {
	const catalog: ActionCatalog = {
		actions: [
			{ id: "jump", kind: "discrete", essential: true },
			{ id: "extra", kind: "discrete", essential: false },
		],
		contexts: [],
		defaults: [],
		coexist: [],
	};
	const expansion = expandBindings([
		{ action: "jump", source: ref("gone"), activation: "press" },
	]);
	const guard = new EssentialGuard(catalog);
	expect(guard.compute(expansion)).toEqual([{ action: "jump" }]);
	expect(new DanglingRefDiagnostics().compute(expansion)).toEqual([
		{ action: "jump", target: "gone" },
	]);
});

test("persistence round-trips and defaults when empty", () => {
	const catalog: ActionCatalog = {
		actions: [{ id: "interact", kind: "discrete", essential: false }],
		contexts: [],
		defaults: [
			{
				action: "interact",
				source: tokens(token.keyboard("E")),
				activation: "press",
			},
		],
		coexist: [],
	};
	const store = new MemorySettingsStore();
	const persistence = new BindingsPersistence(store);
	expect(persistence.load(catalog).bindings).toEqual(
		catalog.defaults,
	);

	persistence.save([
		{
			action: "interact",
			source: tokens(token.keyboard("F")),
			activation: "press",
		},
	]);
	const loaded = persistence.load(catalog);
	expect(loaded.bindings[0]!.source).toEqual(
		tokens(token.keyboard("F")),
	);
});

test("id migration remaps action and ref targets on load", () => {
	const catalog: ActionCatalog = {
		actions: [
			{ id: "interact", kind: "discrete", essential: false },
			{ id: "dialogue.advance", kind: "discrete", essential: false },
		],
		contexts: [],
		defaults: [],
		coexist: [],
	};
	const store = new MemorySettingsStore();
	const persistence = new BindingsPersistence(store);
	persistence.save([
		{
			action: "use",
			source: tokens(token.keyboard("E")),
			activation: "press",
		},
		{
			action: "dialogue.advance",
			source: ref("use"),
			activation: "press",
		},
	]);
	const loaded = persistence.load(catalog, { use: "interact" });
	const advance = loaded.bindings.find(
		(b) => b.action === "dialogue.advance",
	);
	expect(advance!.source).toEqual(ref("interact"));
});

test("missing ref target drops the ref, falls back to default, surfaces once", () => {
	const catalog: ActionCatalog = {
		actions: [{ id: "advance", kind: "discrete", essential: false }],
		contexts: [],
		defaults: [
			{
				action: "advance",
				source: tokens(token.keyboard("SPACE")),
				activation: "press",
			},
		],
		coexist: [],
	};
	const store = new MemorySettingsStore();
	const persistence = new BindingsPersistence(store);
	persistence.save([
		{ action: "advance", source: ref("gone"), activation: "press" },
	]);
	const loaded = persistence.load(catalog);
	expect(loaded.bindings).toEqual([
		{
			action: "advance",
			source: tokens(token.keyboard("SPACE")),
			activation: "press",
		},
	]);
	expect(loaded.notices).toHaveLength(1);
});
