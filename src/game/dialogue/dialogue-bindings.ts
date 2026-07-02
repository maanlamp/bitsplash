import type { DialogueBindings } from "../../engine/dialogue/dialogue-system";
import type { Seconds } from "../../engine/duration";
import { InteractionStateComponent } from "../interaction/interaction-state-component";
import { DIALOGUE_UI, dialogueTextWidth } from "./dialogue-ui";
import { InputBindings } from "../input-bindings";

export const platformerDialogueBindings: DialogueBindings = {
	textWidth: dialogueTextWidth,
	maxLines: DIALOGUE_UI.maxTextLines,
	charactersPerSecond: 24,
	commaPauseChars: 8,
	stopPauseChars: 20,
	slideIn: 0.35 as Seconds,
	slideOut: 0.25 as Seconds,
	advancePressed: ({ ecs }) =>
		ecs.query(InteractionStateComponent)[0]?.[1].pressedThisFrame ??
		false,
	consumeAdvance: ({ ecs }) => {
		const entry = ecs.query(InteractionStateComponent)[0];
		if (entry) {
			entry[1].pressedThisFrame = false;
		}
	},
	navUpHeld: ({ input }) => !!input.keyboard.keys[InputBindings.up],
	navDownHeld: ({ input }) =>
		!!input.keyboard.keys[InputBindings.down],
};
