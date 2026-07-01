import type { DialogueBindings } from "../../engine/dialogue/dialogue-system";
import type { ECS } from "../../engine/ecs";
import { InteractionStateComponent } from "../interaction/interaction-state-component";
import { PlayerInputComponent } from "../player/player-input-component";
import { DIALOGUE_UI, dialogueTextWidth } from "./dialogue-ui";
import { InputBindings } from "../input-bindings";

export const platformerDialogueBindings: DialogueBindings = {
	textWidth: dialogueTextWidth,
	maxLines: DIALOGUE_UI.maxTextLines,
	advancePressed: ({ ecs }) =>
		ecs.query(InteractionStateComponent)[0]?.[1].pressedThisFrame ??
		false,
	consumeAdvance: ({ ecs }) => {
		const entry = ecs.query(InteractionStateComponent)[0];
		if (entry) {
			entry[1].pressedThisFrame = false;
		}
	},
	cancelHeld: ({ input }) => !!input.keyboard.keys.ESCAPE,
	navUpHeld: ({ input }) => !!input.keyboard.keys[InputBindings.up],
	navDownHeld: ({ input }) =>
		!!input.keyboard.keys[InputBindings.down],
	playerId: (ecs: ECS) =>
		ecs.query(PlayerInputComponent)[0]?.[0] ?? null,
};
