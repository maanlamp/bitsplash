import { DialogueComponent } from "../../engine/components/dialogue";
import { InkStoryComponent } from "../../engine/components/ink-story";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { DialogueSourceComponent } from "../components/dialogue-source";
import { InteractionStateComponent } from "../components/interaction-state";
import { InteractEvent } from "../events";
import { ensureStory } from "../ink/bindings";
import { fontForTag } from "../ink/fonts";
import { panelForTag } from "../ink/panels";
import { tagValue } from "../ink/tags";

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
