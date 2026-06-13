import { resolveFont } from "../../engine/resolve-font";
import { parseRichText, wrapRichText } from "../../engine/rich-text";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { DialogueComponent } from "../components/dialogue";
import { DialogueSourceComponent } from "../components/dialogue-source";
import { InteractionStateComponent } from "../components/interaction-state";
import { dialogueTextWidth } from "../dialogue-ui";
import { InteractEvent } from "../events";

export class DialogueTriggerSystem implements UpdateSystem {
	update({ ecs, events, assetManager }: UpdateContext): void {
		if (ecs.query(DialogueComponent)[0]) {
			return;
		}
		for (const event of events.read(InteractEvent)) {
			const source = ecs.getComponent(
				event.interactable,
				DialogueSourceComponent,
			);
			if (!source) {
				continue;
			}
			const font = resolveFont(source.font, assetManager);
			if (!font) {
				return;
			}
			const lines = wrapRichText(
				font,
				parseRichText(source.text),
				dialogueTextWidth,
			);
			ecs.createEntity([
				new DialogueComponent(
					lines,
					source.charactersPerSecond,
					event.interactable,
					event.interactable,
				),
			]);
			const stateEntry = ecs.query(InteractionStateComponent)[0];
			if (stateEntry) {
				stateEntry[1].pressedThisFrame = false;
			}
			return;
		}
	}
}
