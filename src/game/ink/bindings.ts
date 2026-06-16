import type { Story } from "inkjs/full";
import type { InkStoryComponent } from "../../engine/components/ink-story";
import { ensureStory as ensureStoryWith } from "../../engine/ink/story";
import type EventBus from "../../engine/events";
import {
	AdvanceQuestEvent,
	QuestDeclinedEvent,
	StartQuestEvent,
} from "../events";
import { createStory } from "./loader";

const bindExternals = (story: Story, events: EventBus): void => {
	story.BindExternalFunction(
		"start_quest",
		(quest: string, stage: string) => {
			events.emit(new StartQuestEvent(quest, stage));
		},
		false,
	);
	story.BindExternalFunction(
		"advance_quest",
		(quest: string, to: string) => {
			events.emit(new AdvanceQuestEvent(quest, to));
		},
		false,
	);
	story.BindExternalFunction(
		"decline_quest",
		(quest: string) => {
			events.emit(new QuestDeclinedEvent(quest));
		},
		false,
	);
	story.BindExternalFunction(
		"give_item",
		(_item: string, _count: number) => 0,
		false,
	);
};

export const ensureStory = (
	component: InkStoryComponent,
	events: EventBus,
): Story =>
	ensureStoryWith(component, createStory, (story) =>
		bindExternals(story, events),
	);
