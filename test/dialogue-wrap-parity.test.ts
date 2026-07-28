import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "bun:test";
import type { Story } from "inkjs/full";
import { wrapDialogueText } from "../src/engine/dialogue/dialogue-text";
import { ECS } from "../src/engine/ecs";
import { compileStory } from "../src/engine/ink/story";
import {
	parseRichText,
	richGlyphCount,
	wrapRichText,
} from "../src/engine/text/rich-text";
import { characterById } from "../src/game/character/character-descriptor";
import { BUBBLE_MAX_TEXT_WIDTH } from "../src/game/dialogue/conversation-view";
import { platformerDialogueBindings } from "../src/game/dialogue/dialogue-bindings";
import {
	conversationFor,
	dialogueHandoff,
} from "../src/game/dialogue/dialogue-handoff";
import { DEFAULT_FONT } from "../src/game/dialogue/ink-fonts";
import { messageMarkup } from "../src/game/dialogue/message";
import { realFont } from "./support/real-fonts";

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

/** The real shipped `.ink`, compiled by the real compiler with externals stubbed. */
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

/** Every knot the campfire chain presents, in the order the cutscene plays them. */
const CAMPFIRE_KNOTS = [
	"campfire.companion",
	"campfire.open",
	"campfire.reply",
	"campfire.stars",
	"campfire.wish",
	"campfire.memory",
	"campfire.quiet",
	"campfire.goodnight",
] as const;

/**
 * Open one knot the way a `dialogue` op does and report the session state plus
 * the message it put on screen.
 */
const present = (knot: string) => {
	const ecs = new ECS();
	const sequence = ecs.createEntity([]);
	const story = shippedStory();
	story.ChoosePathString(knot);
	const { state } = dialogueHandoff({
		ecs,
		story,
		sequence,
		source: null,
		font: DEFAULT_FONT,
		resumed: null,
	});
	const conversation = conversationFor(ecs, sequence);
	return {
		state,
		message: conversation.messages[conversation.cursor]!,
	};
};

test("the typewriter wraps at the width the panel paints at", () => {
	expect(platformerDialogueBindings.textWidth).toBe(
		BUBBLE_MAX_TEXT_WIDTH,
	);
});

test("a session takes the speaker's own typeface, not one font for the whole conversation", () => {
	for (const knot of CAMPFIRE_KNOTS) {
		const { state, message } = present(knot);

		expect(state.font).toBe(characterById(message.characterId).font);
	}
});

test("the typewriter counts exactly the glyphs the panel paints, for every shipped campfire line", async () => {
	for (const knot of CAMPFIRE_KNOTS) {
		const { state, message } = present(knot);
		const font = await realFont(state.font);

		const typed = wrapDialogueText(
			state.text,
			font,
			platformerDialogueBindings.textWidth,
			platformerDialogueBindings,
		);
		const painted = wrapRichText(
			font,
			parseRichText(messageMarkup(message)),
			BUBBLE_MAX_TEXT_WIDTH,
		);

		expect({ knot, glyphs: typed.chars.length }).toEqual({
			knot,
			glyphs: richGlyphCount(painted),
		});
	}
});
