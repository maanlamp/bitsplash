import { DialogueComponent } from "../../engine/dialogue/dialogue-component";
import { InkStoryComponent } from "../../engine/ink/ink-story-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { DialogueSourceComponent } from "../dialogue/dialogue-source-component";
import { InteractionStateComponent } from "../interaction/interaction-state-component";
import { InteractEvent } from "../events";
import { ensureStory } from "../dialogue/ink-bindings";
import { fontForTag } from "../dialogue/ink-fonts";
import { panelForTag } from "../dialogue/ink-panels";
import { tagValue } from "../dialogue/ink-tags";

export class DialogueTriggerSystem implements UpdateSystem {
	update({ ecs, events }: UpdateContext): void {
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
			const inkEntry = ecs.query(InkStoryComponent)[0];
			if (!inkEntry) {
				return;
			}
			const story = ensureStory(inkEntry[1], events, ecs);
			const tags = story.TagsForContentAtPath(source.knot);
			const font = fontForTag(tagValue(tags, "font"));
			const panel = panelForTag(tagValue(tags, "panel"));
			story.ChoosePathString(source.knot);
			ecs.createEntity([
				new DialogueComponent(event.interactable, font, panel),
			]);
			const stateEntry = ecs.query(InteractionStateComponent)[0];
			if (stateEntry) {
				stateEntry[1].pressedThisFrame = false;
			}
			return;
		}
	}
}
