import { describe, expect, test } from "bun:test";
import { Camera2D } from "../src/engine/camera/camera-2d";
import { Camera2DComponent } from "../src/engine/camera/camera-2d-component";
import { Camera2DFollowComponent } from "../src/engine/camera/camera-2d-follow-component";
import { Camera2DFollowSystem } from "../src/engine/camera/camera-2d-follow-system";
import { CameraTransitionSystem } from "../src/engine/camera/camera-transition-system";
import { DialogueComponent } from "../src/engine/dialogue/dialogue-component";
import {
	type DialogueBindings,
	DialogueSystem,
} from "../src/engine/dialogue/dialogue-system";
import type { EntityId } from "../src/engine/ecs";
import { InkStoryComponent } from "../src/engine/ink/ink-story-component";
import { SequenceComponent } from "../src/engine/sequence/sequence-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../src/engine/system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { ChronicleComponent } from "../src/game/chronicle/chronicle-component";
import { ConversationComponent } from "../src/game/dialogue/conversation-component";
import { platformerDialogueBindings } from "../src/game/dialogue/dialogue-bindings";
import { DialogueSourceComponent } from "../src/game/dialogue/dialogue-source-component";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
import massacre from "../src/game/content/quests/massacre.json";
import {
	type QuestDef,
	registerQuest,
} from "../src/game/quest/loader";
import { QuestComponent } from "../src/game/quest/quest-component";
import { QuestSystem } from "../src/game/quest/quest-system";
import { checkpointBridgeSequence } from "../src/game/sequence/checkpoint-bridge-sequence";
import {
	boundInkStoryComponent,
	gameSequenceSceneConfig,
} from "./support/game-sequence-scene";
import { warmDialogueFonts } from "./support/real-fonts";
import {
	SequenceFixture,
	settleAssets,
	useDiskFetch,
} from "./support/sequence-harness";

/**
 * The shipped `checkpoint.demand` exchange — an unbracketed choice, so ink echoes
 * the chosen line — plus a quest and a chronicle external inside the knot the
 * branch reaches, which is the pair a fast-forward used to discard.
 */
const CHECKPOINT_INK = [
	'VAR quest_massacre = "none"',
	"EXTERNAL start_quest(quest, stage)",
	"EXTERNAL advance_quest(quest, to)",
	"EXTERNAL decline_quest(quest)",
	"EXTERNAL give_item(item, count)",
	"EXTERNAL start_cutscene(id)",
	"EXTERNAL set_chronicle(flag, value)",
	"-> END",
	"=== checkpoint ===",
	"= guard",
	"# speaker: pennywhistle",
	"# emotion: smug",
	"This is a toll bridge, friend.",
	"-> DONE",
	"= demand",
	"# speaker: pennywhistle",
	"# emotion: angry",
	"Halt! Nobody crosses without paying the Pennywhistle Toll.",
	"+ You slide a fat purse across the plank. # id: bribe",
	"+ You refuse, and stand your ground. # id: refuse",
	"- -> DONE",
	"= bribe_accept",
	"# speaker: pennywhistle",
	"# emotion: happy",
	"Ohoho! Now THAT is a convincing reason.",
	'~ start_quest("massacre", "offered")',
	'~ set_chronicle("checkpoint.toll", "paid")',
	"-> DONE",
	"= refuse",
	"# speaker: pennywhistle",
	"# emotion: angry",
	"No coin? Bold. Foolish, but bold.",
	"-> DONE",
	"= wave_through",
	"# speaker: pennywhistle",
	"# emotion: neutral",
	"Go on, then. Mind the third plank.",
	"-> DONE",
	"",
].join("\n");

const FRAME_BUDGET = 900;
const GAMEPLAY_ZOOM = 3;

/** `[characterId, kind, emotion, text]` per transcript message, oldest first. */
type TranscriptRow = readonly string[];

type Observation = {
	transcript: readonly TranscriptRow[];
	answer: unknown;
	sessions: Set<EntityId>;
	concurrentSessions: number;
};

/**
 * Reads the conversation and the run blackboard from *inside* the frame, after
 * `SequenceSystem` and before `ecs.flushDestroyed()` — the last fast-forward pass
 * finishes the whole sequence, so the transcript and the captured choice are gone
 * by the time a caller between frames could look.
 */
class TranscriptObserver extends UpdateSystem {
	constructor(private readonly into: Observation) {
		super();
	}

	update({ ecs }: UpdateContext): void {
		const open = ecs.query(DialogueComponent);
		this.into.concurrentSessions = Math.max(
			this.into.concurrentSessions,
			open.length,
		);
		for (const [id] of open) {
			this.into.sessions.add(id);
		}
		const sequence = ecs.query(SequenceComponent)[0];
		if (!sequence) {
			return;
		}
		this.into.answer =
			sequence[1].run.blackboard.answer ?? this.into.answer;
		const conversation = ecs.getComponent(
			sequence[0],
			ConversationComponent,
		);
		if (conversation && conversation.messages.length > 0) {
			this.into.transcript = conversation.messages.map((message) => [
				message.characterId,
				message.kind,
				message.emotion ?? "none",
				message.text,
			]);
		}
	}
}

type Outcome = Readonly<{
	transcript: readonly TranscriptRow[];
	answer: unknown;
	guardsFlag: string | undefined;
	tollFlag: string | undefined;
	questId: string | undefined;
	questStage: string | undefined;
	inkQuestVar: unknown;
	/** How many entities ever carried a {@link DialogueComponent}. */
	sessions: number;
	concurrentSessions: number;
	inkSnapshotCurrent: boolean;
}>;

/**
 * Advance bindings that never touch `actions`: a press every frame while the
 * sequence is played through, and only to answer a choice while it is
 * fast-forwarded — so a held key cannot dismiss a bubble the fast-forward is
 * meant to consume.
 */
const advanceBindings = (fastForward: boolean): DialogueBindings => ({
	...platformerDialogueBindings,
	advancePressed: ({ ecs }) =>
		!fastForward ||
		(ecs.query(DialogueComponent)[0]?.[1].choices.length ?? 0) > 0,
	consumeAdvance: () => {},
});

const runCheckpoint = async (
	fastForward: boolean,
): Promise<Outcome> => {
	const restoreFetch = useDiskFetch();
	registerQuest(massacre as QuestDef);
	const observation: Observation = {
		transcript: [],
		answer: undefined,
		sessions: new Set(),
		concurrentSessions: 0,
	};
	const fixture = await SequenceFixture.create(
		gameSequenceSceneConfig({
			def: checkpointBridgeSequence,
			skipHeld: () => fastForward,
			seedScene: (world) => {
				world.ecs.createEntity([
					boundInkStoryComponent(world, CHECKPOINT_INK),
				]);
				world.ecs.createEntity([new ChronicleComponent()]);
				const player = world.ecs.createEntity([
					new PlayerInputComponent(),
					new TransformComponent(),
				]);
				world.ecs.createEntity([
					new DialogueSourceComponent("checkpoint.guard"),
					new TransformComponent(new Vector2(96, 0)),
				]);
				world.ecs.createEntity([
					new Camera2DComponent(
						new Camera2D(Vector2.zero(), GAMEPLAY_ZOOM),
					),
					new Camera2DFollowComponent({
						targets: [player],
						zoom: GAMEPLAY_ZOOM,
					}),
				]);
			},
			preSystems: (world) => {
				world.ecs.addUpdateSystem(
					new DialogueSystem(advanceBindings(fastForward)),
				);
				world.ecs.addUpdateSystem(new QuestSystem());
			},
			extraSystems: (world) => {
				world.ecs.addUpdateSystem(new Camera2DFollowSystem());
				world.ecs.addUpdateSystem(new CameraTransitionSystem());
				world.ecs.addUpdateSystem(
					new TranscriptObserver(observation),
				);
			},
		}),
	);

	warmDialogueFonts(fixture.assetManager);
	await settleAssets();

	let frames = 0;
	while (
		frames < FRAME_BUDGET &&
		fixture.ecs.query(SequenceComponent).length > 0
	) {
		fixture.step(1);
		frames++;
	}
	expect(fixture.ecs.query(SequenceComponent)).toHaveLength(0);

	const chronicle = fixture.ecs.query(ChronicleComponent)[0]![1];
	const quest = fixture.ecs.query(QuestComponent)[0]?.[1];
	const ink = fixture.ecs.query(InkStoryComponent)[0]![1];
	const outcome: Outcome = {
		transcript: observation.transcript,
		answer: observation.answer,
		guardsFlag: chronicle.get("faction.guards"),
		tollFlag: chronicle.get("checkpoint.toll"),
		questId: quest?.id,
		questStage: quest?.stage,
		inkQuestVar: ink.story?.variablesState.quest_massacre,
		sessions: observation.sessions.size,
		concurrentSessions: observation.concurrentSessions,
		inkSnapshotCurrent: ink.state === ink.story?.state.ToJson(),
	};
	fixture.dispose();
	restoreFetch();
	return outcome;
};

describe("fast-forward parity — checkpoint-bridge played vs skipped", () => {
	test("the world ends up in the same state either way", async () => {
		const played = await runCheckpoint(false);
		const skipped = await runCheckpoint(true);

		expect(played.answer).toBe("bribe");
		expect(skipped.answer).toBe(played.answer);

		expect(played.guardsFlag).toBe("bought");
		expect(skipped.guardsFlag).toBe(played.guardsFlag);

		expect(played.tollFlag).toBe("paid");
		expect(skipped.tollFlag).toBe(played.tollFlag);

		expect(played.questId).toBe("massacre");
		expect(played.questStage).toBe("offered");
		expect(skipped.questId).toBe(played.questId);
		expect(skipped.questStage).toBe(played.questStage);
		expect(played.inkQuestVar).toBe("offered");
		expect(skipped.inkQuestVar).toBe(played.inkQuestVar);
	});

	test("both produce the same transcript, echo attribution included", async () => {
		const played = await runCheckpoint(false);
		const skipped = await runCheckpoint(true);

		expect(played.transcript).toEqual([
			[
				"pennywhistle",
				"speech",
				"angry",
				"Halt! Nobody crosses without paying the Pennywhistle Toll.",
			],
			[
				"player",
				"speech",
				"none",
				"You slide a fat purse across the plank.",
			],
			[
				"pennywhistle",
				"speech",
				"happy",
				"Ohoho! Now THAT is a convincing reason.",
			],
			[
				"pennywhistle",
				"speech",
				"neutral",
				"Go on, then. Mind the third plank.",
			],
		]);
		expect(skipped.transcript).toEqual(played.transcript);
	});

	test("a fast-forwarded op creates no session of its own", async () => {
		const played = await runCheckpoint(false);
		const skipped = await runCheckpoint(true);

		expect(played.sessions).toBe(3);
		expect(played.concurrentSessions).toBe(1);
		expect(skipped.sessions).toBe(1);
		expect(skipped.concurrentSessions).toBe(1);
	});

	test("the mirrored ink snapshot matches the story a fast-forward left behind", async () => {
		const skipped = await runCheckpoint(true);

		expect(skipped.inkSnapshotCurrent).toBe(true);
	});
});
