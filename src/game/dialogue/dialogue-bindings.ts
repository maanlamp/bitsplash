import type { DialogueBindings } from "../../engine/dialogue/dialogue-system";
import type { Seconds } from "../../engine/duration";
import { ACTION_IDS } from "../input/action-ids";
import { DIALOGUE_UI, dialogueTextWidth } from "./dialogue-ui";

export const platformerDialogueBindings: DialogueBindings = {
	textWidth: dialogueTextWidth,
	maxLines: DIALOGUE_UI.maxTextLines,
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
	navUpHeld: ({ actions }) => actions.fired(ACTION_IDS.dialogueNavUp),
	navDownHeld: ({ actions }) =>
		actions.fired(ACTION_IDS.dialogueNavDown),
};
