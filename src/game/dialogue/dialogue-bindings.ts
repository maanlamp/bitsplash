import type { DialogueBindings } from "../../engine/dialogue/dialogue-system";
import type { Seconds } from "../../engine/duration";
import { ACTION_IDS } from "../input/action-ids";
import { BUBBLE_MAX_TEXT_WIDTH } from "./conversation-view";
import { presentDialogue } from "./dialogue-handoff";

/**
 * The typewriter counts the **same wrap the panel paints**: the width is
 * `BUBBLE_MAX_TEXT_WIDTH`, and `presentDialogue` puts the speaker's own font and
 * the message's own markup on the session. Wrapping the same string at two widths
 * (or in two typefaces) yields different line counts and, because a wrap drops
 * the space at each break, different glyph counts — so `revealed` would count
 * against a total the panel never paints.
 */
export const platformerDialogueBindings: DialogueBindings = {
	textWidth: BUBBLE_MAX_TEXT_WIDTH,
	charactersPerSecond: 24,
	commaPauseChars: 8,
	midPauseChars: 13,
	stopPauseChars: 20,
	ellipsisPauseChars: 26,
	slideIn: 0.35 as Seconds,
	slideOut: 0.25 as Seconds,
	advancePressed: ({ actions }) =>
		actions.fired(ACTION_IDS.dialogueAdvance),
	consumeAdvance: ({ actions }) =>
		actions.consume(ACTION_IDS.dialogueAdvance),
	present: presentDialogue,
};
