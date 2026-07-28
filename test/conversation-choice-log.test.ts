import { describe, expect, test } from "bun:test";
import {
	type DialogueBindings,
	DialogueSystem,
} from "../src/engine/dialogue/dialogue-system";
import { SequenceComponent } from "../src/engine/sequence/sequence-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../src/engine/system";
import { TransformComponent } from "../src/engine/transform-component";
import { ChronicleComponent } from "../src/game/chronicle/chronicle-component";
import { ConversationComponent } from "../src/game/dialogue/conversation-component";
import { platformerDialogueBindings } from "../src/game/dialogue/dialogue-bindings";
import { DialogueSourceComponent } from "../src/game/dialogue/dialogue-source-component";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
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

const FRAME_BUDGET = 600;

const knot = (options: readonly string[]): string =>
	[
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
		"This is a toll bridge, friend.",
		"-> DONE",
		"= demand",
		"# speaker: pennywhistle",
		"Which will it be?",
		...options,
		"- -> DONE",
		"= bribe_accept",
		"# speaker: pennywhistle",
		"A convincing reason.",
		"-> DONE",
		"= refuse",
		"# speaker: pennywhistle",
		"Bold. Foolish, but bold.",
		"-> DONE",
		"= wave_through",
		"# speaker: pennywhistle",
		"Go on, then.",
		"-> DONE",
		"",
	].join("\n");

/**
 * Ink suppresses a bracketed option's echo, so `# narrate` is what asks for a
 * record of it. Tags on a bracketed option go *before* the bracket: anything
 * after `]` is output content, not a tag on the choice.
 */
const NARRATED = knot([
	"+ # narrate # id: bribe [Slide a fat purse across the plank]",
	"+ [Refuse] -> refuse",
]);

/** The same option without the tag: chosen, obeyed, and never logged. */
const SILENT = knot([
	"+ # id: bribe [Slide a fat purse across the plank]",
	"+ [Refuse] -> refuse",
]);

/** An unbracketed option is echoed, and that echo is already the record. */
const UNBRACKETED = knot([
	"+ You slide a fat purse across the plank. # id: bribe",
	"+ You refuse, and stand your ground. # id: refuse",
]);

/** `[characterId, kind, text]` per transcript entry, oldest first. */
type Row = readonly string[];

/**
 * The transcript has to be read from inside the frame: the last op finishes the
 * sequence, taking the conversation entity with it before a caller between frames
 * could look.
 */
class Observer extends UpdateSystem {
	rows: readonly Row[] = [];

	update({ ecs }: UpdateContext): void {
		const conversation = ecs.query(ConversationComponent)[0]?.[1];
		if (conversation && conversation.messages.length > 0) {
			this.rows = conversation.messages.map((message) => [
				message.characterId,
				message.kind,
				message.text,
			]);
		}
	}
}

const always: DialogueBindings = {
	...platformerDialogueBindings,
	advancePressed: () => true,
	consumeAdvance: () => {},
};

const runCheckpoint = async (
	ink: string,
): Promise<readonly Row[]> => {
	const restoreFetch = useDiskFetch();
	const observer = new Observer();
	const fixture = await SequenceFixture.create(
		gameSequenceSceneConfig({
			def: checkpointBridgeSequence,
			seedScene: (world) => {
				world.ecs.createEntity([boundInkStoryComponent(world, ink)]);
				world.ecs.createEntity([new ChronicleComponent()]);
				world.ecs.createEntity([
					new PlayerInputComponent(),
					new TransformComponent(),
				]);
				world.ecs.createEntity([
					new DialogueSourceComponent("checkpoint.guard"),
					new TransformComponent(),
				]);
			},
			preSystems: (world) => {
				world.ecs.addUpdateSystem(new DialogueSystem(always));
			},
			extraSystems: (world) => {
				world.ecs.addUpdateSystem(observer);
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
	fixture.dispose();
	restoreFetch();
	return observer.rows;
};

describe("chosen choices in the log", () => {
	test("a bracketed choice tagged # narrate is recorded as player narration", async () => {
		const rows = await runCheckpoint(NARRATED);

		expect(rows[0]).toEqual([
			"pennywhistle",
			"speech",
			"Which will it be?",
		]);
		expect(rows[1]).toEqual([
			"player",
			"narration",
			"Slide a fat purse across the plank",
		]);
		expect(rows.filter((row) => row[1] === "narration")).toHaveLength(
			1,
		);
		expect(rows.at(-1)).toEqual([
			"pennywhistle",
			"speech",
			"Go on, then.",
		]);
	});

	test("an untagged bracketed choice leaves no entry, but still takes its branch", async () => {
		const rows = await runCheckpoint(SILENT);

		expect(rows.filter((row) => row[1] === "narration")).toHaveLength(
			0,
		);
		expect(rows.some((row) => row[2]!.includes("fat purse"))).toBe(
			false,
		);
		expect(rows.map((row) => row[2])).toEqual([
			"Which will it be?",
			"A convincing reason.",
			"Go on, then.",
		]);
	});

	test("a # narrate tag does not swallow the # id: the branch is captured by", async () => {
		const rows = await runCheckpoint(NARRATED);

		expect(rows.map((row) => row[2])).toContain(
			"A convincing reason.",
		);
	});

	test("an unbracketed choice's echo is the record, spoken, and not doubled", async () => {
		const rows = await runCheckpoint(UNBRACKETED);
		const purse = rows.filter((row) => row[2]!.includes("fat purse"));

		expect(purse).toHaveLength(1);
		expect(purse[0]).toEqual([
			"player",
			"speech",
			"You slide a fat purse across the plank.",
		]);
	});

	test("unchosen options leave no trace", async () => {
		const rows = await runCheckpoint(NARRATED);

		expect(rows.some((row) => row[2]!.includes("Refuse"))).toBe(
			false,
		);
	});
});
