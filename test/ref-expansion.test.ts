import { expect, test } from "bun:test";
import type { Binding } from "../src/engine/input/bindings/action-catalog";
import {
	detectRefCycle,
	expandBindings,
	sourceKey,
} from "../src/engine/input/bindings/ref-expansion";
import { token } from "../src/engine/input/edge-detector";

const tokens = (...t: string[]) => ({
	kind: "tokens" as const,
	tokens: t,
});
const ref = (action: string) => ({ kind: "ref" as const, action });
const chord = (...t: string[]) => ({
	kind: "chord" as const,
	tokens: t,
});

test("chains resolve transitively to terminal physical sources", () => {
	const bindings: Binding[] = [
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
		{
			action: "fastforward",
			source: ref("advance"),
			activation: "hold",
		},
	];
	const expansion = expandBindings(bindings);
	const ff = expansion.byAction.get("fastforward") ?? [];
	expect(ff).toHaveLength(1);
	expect(ff[0]!.viaRef).toBe(true);
	expect(ff[0]!.owner).toBe("interact");
	expect(ff[0]!.activation).toBe("hold");
	expect(sourceKey(ff[0]!.source)).toBe(
		sourceKey(tokens(token.keyboard("E"))),
	);
});

test("dangling ref is detected and drops the binding", () => {
	const bindings: Binding[] = [
		{
			action: "advance",
			source: ref("missing"),
			activation: "press",
		},
	];
	const expansion = expandBindings(bindings);
	expect(expansion.byAction.get("advance") ?? []).toHaveLength(0);
	expect(expansion.danglingRefs).toEqual([
		{ action: "advance", target: "missing" },
	]);
});

test("cycles are found at edit time by canonical DFS", () => {
	const bindings: Binding[] = [
		{ action: "a", source: ref("b"), activation: "press" },
		{ action: "b", source: ref("a"), activation: "press" },
	];
	const edges = detectRefCycle(bindings);
	expect(edges).toHaveLength(1);
	expect(edges[0]!.to).toBe("a");
});

test("expansion drops the back-edge instead of looping forever", () => {
	const bindings: Binding[] = [
		{
			action: "a",
			source: tokens(token.keyboard("A")),
			activation: "press",
		},
		{ action: "a", source: ref("b"), activation: "press" },
		{ action: "b", source: ref("a"), activation: "press" },
	];
	const expansion = expandBindings(bindings);
	expect(expansion.droppedEdges.length).toBeGreaterThan(0);
	expect(expansion.byAction.get("b") ?? []).not.toHaveLength(0);
});

test("invalid chord members are reported", () => {
	const bindings: Binding[] = [
		{
			action: "combo",
			source: chord(token.keyboard("CTRL"), "notatoken"),
			activation: "press",
		},
	];
	const expansion = expandBindings(bindings);
	expect(expansion.invalidChordTokens).toContain("notatoken");
});
