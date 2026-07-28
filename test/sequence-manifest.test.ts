import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, test } from "bun:test";
import type { Story } from "inkjs/full";
import { compileStory } from "../src/engine/ink/story";
import { walkNodes } from "../src/engine/sequence/op";
import {
	lookupCastResolver,
	lookupOpType,
	lookupPredicate,
} from "../src/engine/sequence/op-registry";
import { sequenceDefById } from "../src/engine/sequence/sequence-system";
import type { SequenceDef } from "../src/engine/sequence/sequence-def";
import { tagValue } from "../src/engine/ink/ink-tags";
import {
	registerSequenceContent,
	SEQUENCE_DEFS,
} from "../src/game/sequence/sequence-manifest";

const DIALOGUE_DIR = "src/game/content/dialogue";

const inkSources = (): Record<string, string> => {
	const sources: Record<string, string> = {};
	for (const entry of readdirSync(DIALOGUE_DIR, {
		withFileTypes: true,
		recursive: true,
	})) {
		if (entry.isFile() && entry.name.endsWith(".ink")) {
			sources[basename(entry.name)] = readFileSync(
				join(entry.parentPath, entry.name),
				"utf8",
			);
		}
	}
	return sources;
};

const knotResolves = (story: Story, knot: string): boolean => {
	const [name, stitch] = knot.split(".");
	const container = name ? story.KnotContainerWithName(name) : null;
	if (!container) {
		return false;
	}
	return stitch === undefined || container.namedContent.has(stitch);
};

const referencedKnots = (def: SequenceDef): Set<string> => {
	const knots = new Set<string>();
	walkNodes(def.root, (node) => {
		if (node.kind === "op") {
			const knot = node.params.knot;
			if (typeof knot === "string") {
				knots.add(knot);
			}
		}
	});
	for (const ref of Object.values(def.cast)) {
		if (ref.resolver === "npcByKnot") {
			const knot = ref.params?.knot;
			if (typeof knot === "string") {
				knots.add(knot);
			}
		}
	}
	return knots;
};

describe("sequence content manifest coverage", () => {
	registerSequenceContent();

	const collectRefs = (def: SequenceDef) => {
		const ops = new Set<string>();
		const predicates = new Set<string>();
		walkNodes(def.root, (node) => {
			if (node.kind === "op") {
				ops.add(node.type);
			}
			if (node.kind === "waitUntil") {
				predicates.add(node.cond.predicate);
			}
			if (node.kind === "branch") {
				predicates.add(node.cond.predicate);
			}
		});
		const casts = new Set(
			Object.values(def.cast).map((ref) => ref.resolver),
		);
		return { ops, predicates, casts };
	};

	for (const def of SEQUENCE_DEFS) {
		test(`"${def.id}" resolves and all its ids are registered`, () => {
			expect(sequenceDefById(def.id)).toBe(def);
			const { ops, predicates, casts } = collectRefs(def);
			for (const op of ops) {
				expect(() => lookupOpType(op)).not.toThrow();
			}
			for (const predicate of predicates) {
				expect(() => lookupPredicate(predicate)).not.toThrow();
			}
			for (const cast of casts) {
				expect(() => lookupCastResolver(cast)).not.toThrow();
			}
		});
	}

	test("the manifest registers the shipped defs", () => {
		expect(SEQUENCE_DEFS.map((def) => def.id).sort()).toEqual(
			[
				"ambush-drill",
				"campfire-stargazer",
				"checkpoint-bridge",
				"lost-critter-found",
				"lost-critter-home",
				"npc-chat",
				"pickup-tour",
				"pickup-tour-kiss",
			].sort(),
		);
	});
});

describe("sequence content ink knots resolve", () => {
	const story = compileStory(inkSources(), "main.ink");

	for (const def of SEQUENCE_DEFS) {
		const knots = referencedKnots(def);
		if (knots.size === 0) {
			continue;
		}
		test(`"${def.id}" references only knots that exist in ink`, () => {
			for (const knot of knots) {
				expect(knotResolves(story, knot)).toBe(true);
			}
		});
	}

	test("checkpoint.demand offers bribe and refuse tagged choices", () => {
		for (const name of [
			"start_quest",
			"advance_quest",
			"decline_quest",
			"give_item",
			"start_cutscene",
		]) {
			story.BindExternalFunction(name, () => 0, false);
		}
		story.ChoosePathString("checkpoint.demand");
		while (story.canContinue) {
			story.Continue();
		}
		const ids = story.currentChoices.map((choice) =>
			tagValue(choice.tags ?? [], "id"),
		);
		expect(ids).toContain("bribe");
		expect(ids).toContain("refuse");
	});
});
