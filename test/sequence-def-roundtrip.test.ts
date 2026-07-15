import { describe, expect, test } from "bun:test";
import {
	bark,
	sequenceDef,
	seq,
	wait,
} from "../src/engine/sequence/builder";
import {
	childrenOf,
	type OpNode,
	walkNodes,
} from "../src/engine/sequence/op";
import type { SequenceDef } from "../src/engine/sequence/sequence-def";
import { ambushDrillSequence } from "../src/game/sequence/ambush-drill-sequence";
import { campfireStargazerSequence } from "../src/game/sequence/campfire-stargazer-sequence";
import { checkpointBridgeSequence } from "../src/game/sequence/checkpoint-bridge-sequence";
import {
	lostCritterFoundSequence,
	lostCritterHomeSequence,
} from "../src/game/sequence/lost-critter-sequence";

const DEFS: ReadonlyArray<readonly [string, SequenceDef]> = [
	["checkpoint-bridge", checkpointBridgeSequence],
	["ambush-drill", ambushDrillSequence],
	["campfire-stargazer", campfireStargazerSequence],
	["lost-critter-found", lostCritterFoundSequence],
	["lost-critter-home", lostCritterHomeSequence],
];

describe("sequence def JSON round-trip", () => {
	for (const [name, def] of DEFS) {
		test(`${name} round-trips through JSON unchanged`, () => {
			const json = JSON.stringify(def);
			const reloaded = JSON.parse(json) as SequenceDef;
			expect(reloaded).toEqual(def);
			expect(JSON.stringify(reloaded)).toBe(json);
		});

		test(`${name} has unique, non-empty stepIds on every node`, () => {
			const ids = new Set<string>();
			walkNodes(def.root, (node: OpNode) => {
				expect(node.stepId).not.toBe("");
				expect(ids.has(node.stepId)).toBe(false);
				ids.add(node.stepId);
			});
			expect(ids.size).toBeGreaterThan(0);
		});
	}

	test("no def contains a function anywhere in its data (code/data line)", () => {
		const assertNoFunctions = (
			value: unknown,
			path: string,
		): void => {
			expect(typeof value).not.toBe("function");
			if (value !== null && typeof value === "object") {
				for (const [key, v] of Object.entries(value)) {
					assertNoFunctions(v, `${path}.${key}`);
				}
			}
		};
		for (const [name, def] of DEFS) {
			assertNoFunctions(def, name);
		}
	});

	test("duplicate stepId is rejected at build time (rule 2)", () => {
		expect(() =>
			sequenceDef({
				id: "dupe",
				class: "ambient",
				cast: {},
				root: seq(
					"root",
					wait("dup", 1),
					bark("dup", { actor: "a", knot: "k" }),
				),
			}),
		).toThrow(/duplicate stepId "dup"/);
	});

	test("empty stepId is rejected at build time (rule 2)", () => {
		expect(() =>
			sequenceDef({
				id: "empty",
				class: "ambient",
				cast: {},
				root: seq("", wait("w", 1)),
			}),
		).toThrow(/empty stepId/);
	});

	test("childrenOf/walkNodes traverse branch arms", () => {
		const branchDef = checkpointBridgeSequence;
		const kinds = new Set<string>();
		walkNodes(branchDef.root, (n) => kinds.add(n.kind));
		expect(kinds.has("branch")).toBe(true);
		const branch = [...collect(branchDef.root)].find(
			(n) => n.kind === "branch",
		);
		expect(branch).toBeDefined();
		expect(childrenOf(branch!).length).toBe(2);
	});
});

const collect = function* (node: OpNode): Generator<OpNode> {
	yield node;
	for (const child of childrenOf(node)) {
		yield* collect(child);
	}
};
