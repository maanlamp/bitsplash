import { describe, expect, test } from "bun:test";
import { InkStoryComponent } from "../src/engine/ink/ink-story-component";
import { mirrorInkState } from "../src/engine/ink/story";
import { seq, sequenceDef } from "../src/engine/sequence/builder";
import type { LeafOpNode } from "../src/engine/sequence/op";
import { registerOpType } from "../src/engine/sequence/op-registry";
import { SequenceComponent } from "../src/engine/sequence/sequence-component";
import { ensureStory } from "../src/game/dialogue/ink-bindings";
import massacre from "../src/game/content/quests/massacre.json";
import {
	type QuestDef,
	registerQuest,
} from "../src/game/quest/loader";
import { QuestComponent } from "../src/game/quest/quest-component";
import { QuestSystem } from "../src/game/quest/quest-system";
import {
	boundInkStoryComponent,
	gameSequenceSceneConfig,
} from "./support/game-sequence-scene";
import { SequenceFixture } from "./support/sequence-harness";

const QUEST_INK = [
	'VAR quest_massacre = "none"',
	"EXTERNAL start_quest(quest, stage)",
	"EXTERNAL advance_quest(quest, to)",
	"EXTERNAL decline_quest(quest)",
	"EXTERNAL give_item(item, count)",
	"EXTERNAL start_cutscene(id)",
	"-> END",
	"=== quest_giver ===",
	"= offer",
	"Five of the Margrave's patrols walk this wood. I want them dead.",
	'~ start_quest("massacre", "offered")',
	"-> DONE",
	"= accept",
	"Good. Five of them. Don't disappoint me.",
	'~ start_quest("massacre", "offered")',
	'~ advance_quest("massacre", "active")',
	"-> DONE",
	"",
].join("\n");

const FAST_FORWARD_OP = "test.fastForwardKnot";

let opRegistered = false;

/**
 * A stand-in for the dialogue op's fast-forward: on skip it opens its knot and
 * drives `Continue()` to the end, so every external in the knot fires from
 * inside `SequenceSystem`'s update rather than from `DialogueSystem`'s.
 */
const registerFastForwardOp = (): void => {
	if (opRegistered) {
		return;
	}
	opRegistered = true;
	registerOpType(FAST_FORWARD_OP, {
		arm() {},
		poll() {
			return false;
		},
		skip(ctx, params) {
			const entry = ctx.ecs.query(InkStoryComponent)[0];
			if (!entry) {
				throw new Error("fast-forward op: no ink story in the world");
			}
			const story = ensureStory(entry[1], ctx.events, ctx.ecs);
			story.ChoosePathString(params.knot as string);
			while (story.canContinue) {
				story.Continue();
			}
			mirrorInkState(entry[1]);
			return true;
		},
	});
};

const fastForwardNode = (knot: string): LeafOpNode => ({
	kind: "op",
	type: FAST_FORWARD_OP,
	stepId: "ff",
	params: { knot },
});

/**
 * Fast-forwards `knot` with `QuestSystem` registered *upstream* of
 * `SequenceSystem`, matching the shipped composition order — the order in which
 * an event-mediated external would be discarded.
 */
const fastForwardFixture = async (
	knot: string,
): Promise<SequenceFixture> => {
	registerFastForwardOp();
	registerQuest(massacre as QuestDef);
	return SequenceFixture.create(
		gameSequenceSceneConfig({
			def: sequenceDef({
				id: `quest-external-ff-${knot}`,
				class: "exclusive",
				cast: {},
				root: seq("root", fastForwardNode(knot)),
			}),
			skipHeld: () => true,
			seedScene: (world) => {
				world.ecs.createEntity([
					boundInkStoryComponent(world, QUEST_INK),
				]);
			},
			preSystems: (world) => {
				world.ecs.addUpdateSystem(new QuestSystem());
			},
		}),
	);
};

const quest = (
	fixture: SequenceFixture,
): QuestComponent | undefined =>
	fixture.ecs.query(QuestComponent)[0]?.[1];

const inkVar = (fixture: SequenceFixture, key: string): unknown =>
	fixture.ecs.query(InkStoryComponent)[0]?.[1].story?.variablesState[
		key
	];

describe("quest ink externals are order-independent", () => {
	test("start_quest inside a fast-forwarded knot lands", async () => {
		const fixture = await fastForwardFixture("quest_giver.offer");

		fixture.step(40);
		expect(fixture.ecs.query(SequenceComponent).length).toBe(0);

		expect(quest(fixture)?.id).toBe("massacre");
		expect(quest(fixture)?.stage).toBe("offered");
		expect(inkVar(fixture, "quest_massacre")).toBe("offered");
		fixture.dispose();
	});

	test("advance_quest in the same fast-forwarded knot reaches the stage", async () => {
		const fixture = await fastForwardFixture("quest_giver.accept");

		fixture.step(40);

		expect(quest(fixture)?.stage).toBe("active");
		expect(inkVar(fixture, "quest_massacre")).toBe("active");
		fixture.dispose();
	});
});
