import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import type { Story } from "inkjs/full";
import {
	gatherMessages,
	NO_SPEAKER_TAGS,
} from "../src/engine/dialogue/gather-messages";
import { compileStory } from "../src/engine/ink/story";

const INK_DIR = fileURLToPath(
	new URL("../src/game/content/dialogue/", import.meta.url),
);

const EXTERNALS = [
	"start_quest",
	"advance_quest",
	"decline_quest",
	"give_item",
	"start_cutscene",
] as const;

/**
 * The real shipped `.ink` content, compiled by the real inkjs compiler, with the
 * game's externals stubbed so `Continue()` runs through them.
 */
const shippedStory = (): Story => {
	const sources: Record<string, string> = {};
	for (const file of readdirSync(INK_DIR)) {
		if (file.endsWith(".ink")) {
			sources[file] = readFileSync(`${INK_DIR}${file}`, "utf8");
		}
	}
	const story = compileStory(sources, "main.ink");
	for (const name of EXTERNALS) {
		story.BindExternalFunctionGeneral(name, () => 0, false);
	}
	return story;
};

describe("gatherMessages over the shipped ink", () => {
	test("a tagged stitch yields one block carrying its raw tag values", () => {
		const story = shippedStory();
		story.ChoosePathString("checkpoint.demand");
		const gathered = gatherMessages(story, NO_SPEAKER_TAGS);

		expect(gathered.blocks).toHaveLength(1);
		expect(gathered.blocks[0]!.speaker).toBe("pennywhistle");
		expect(gathered.blocks[0]!.emotion).toBe("angry");
		expect(gathered.blocks[0]!.text).toStartWith(
			"Halt! Nobody crosses",
		);
		expect(gathered.trailing).toEqual({
			speaker: "pennywhistle",
			emotion: "angry",
		});
	});

	test("an echoed unbracketed choice has tags but no speaker: tag, so the speaker carries forward", () => {
		const story = shippedStory();
		story.ChoosePathString("checkpoint.demand");
		const first = gatherMessages(story, NO_SPEAKER_TAGS);
		expect(story.currentChoices).toHaveLength(2);

		story.ChooseChoiceIndex(0);
		const echo = gatherMessages(story, first.trailing);

		expect(echo.blocks).toHaveLength(1);
		expect(echo.blocks[0]!.text).toBe(
			"You slide a fat purse across the plank.",
		);
		expect(echo.blocks[0]!.speaker).toBe("pennywhistle");
		expect(echo.blocks[0]!.emotion).toBe("angry");
	});

	test("a knot-level tag on a blank line attributes the untagged lines that follow it", () => {
		const story = shippedStory();
		story.ChoosePathString("quest_giver");
		const gathered = gatherMessages(story, NO_SPEAKER_TAGS);

		expect(gathered.blocks).toHaveLength(1);
		expect(gathered.blocks[0]!.speaker).toBe("stranger");
		expect(gathered.blocks[0]!.emotion).toBe("determined");
		expect(gathered.blocks[0]!.text).toStartWith(
			"Well met, wanderer.",
		);
	});

	test("a wholly untagged stitch reached through a choice keeps the carried speaker and its authored line breaks", () => {
		const story = shippedStory();
		story.ChoosePathString("speed_test");
		const first = gatherMessages(story, NO_SPEAKER_TAGS);
		expect(first.trailing.speaker).toBe("quickfoot");

		story.ChooseChoiceIndex(0);
		const tale = gatherMessages(story, first.trailing);

		expect(tale.blocks).toHaveLength(1);
		expect(tale.blocks[0]!.speaker).toBe("quickfoot");
		expect(tale.blocks[0]!.emotion).toBe("smug");
		expect(tale.blocks[0]!.text.split("\n")).toHaveLength(2);
		expect(tale.blocks[0]!.text.split("\n")[1]).toBe(
			"I did not stop. <speed=0.5>Not once.</speed>",
		);
	});

	test("a knot with no speaker tag at all leaves the speaker unattributed", () => {
		const story = compileStory(
			{
				"bare.ink": "== bare ==\nJust prose.\n-> DONE",
			},
			"bare.ink",
		);
		story.ChoosePathString("bare");
		const gathered = gatherMessages(story, NO_SPEAKER_TAGS);

		expect(gathered.blocks).toHaveLength(1);
		expect(gathered.blocks[0]!.speaker).toBeNull();
		expect(gathered.blocks[0]!.emotion).toBeNull();
	});

	test("a drained story yields no blocks and preserves the carried tags", () => {
		const story = shippedStory();
		story.ChoosePathString("critter.mew");
		const first = gatherMessages(story, NO_SPEAKER_TAGS);
		expect(first.blocks).toHaveLength(1);

		const dry = gatherMessages(story, first.trailing);
		expect(dry.blocks).toEqual([]);
		expect(dry.trailing).toEqual(first.trailing);
	});
});

describe("gatherMessages block boundaries", () => {
	const TWO_SPEAKERS = [
		"== two_speakers ==",
		"# speaker: bramble",
		"# emotion: happy",
		"Embers don't wink.",
		"# speaker: player",
		"# emotion: surprised",
		"They absolutely do.",
		"And I saw it twice.",
		"# speaker: bramble",
		"Rude, honestly.",
		"-> DONE",
	].join("\n");

	test("a differing speaker: tag starts a new block; a repeated one does not", () => {
		const story = compileStory(
			{ "two.ink": TWO_SPEAKERS },
			"two.ink",
		);
		story.ChoosePathString("two_speakers");
		const gathered = gatherMessages(story, NO_SPEAKER_TAGS);

		expect(
			gathered.blocks.map((block) => [
				block.speaker,
				block.emotion,
				block.text,
			]),
		).toEqual([
			["bramble", "happy", "Embers don't wink."],
			[
				"player",
				"surprised",
				"They absolutely do.\nAnd I saw it twice.",
			],
			["bramble", "surprised", "Rude, honestly."],
		]);
	});

	test("re-declaring the speaker already in effect keeps one block", () => {
		const story = compileStory(
			{
				"same.ink": [
					"== same ==",
					"# speaker: bramble",
					"One.",
					"# speaker: bramble",
					"Two.",
					"-> DONE",
				].join("\n"),
			},
			"same.ink",
		);
		story.ChoosePathString("same");
		const gathered = gatherMessages(story, {
			speaker: "bramble",
			emotion: null,
		});

		expect(gathered.blocks).toHaveLength(1);
		expect(gathered.blocks[0]!.text).toBe("One.\nTwo.");
	});
});
