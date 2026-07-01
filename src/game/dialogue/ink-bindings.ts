import type { Story } from "inkjs/full";
import type { InkStoryComponent } from "../../engine/components/ink-story";
import type { ECS } from "../../engine/ecs";
import { ensureStory as ensureStoryWith } from "../../engine/ink/story";
import type EventBus from "../../engine/events";
import {
	AdvanceQuestEvent,
	QuestDeclinedEvent,
	StartQuestEvent,
} from "../events";
import {
	beginPickupTour,
	endPickupTour,
	nextPickup,
} from "../quest/pickup-tour-system";
import { createStory } from "./ink-loader";

const bindExternals = (
	story: Story,
	events: EventBus,
	ecs: ECS,
): void => {
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
	story.BindExternalFunction(
		"begin_pickup_tour",
		() => {
			beginPickupTour(ecs);
		},
		false,
	);
	story.BindExternalFunction(
		"next_pickup",
		() => nextPickup(ecs),
		false,
	);
	story.BindExternalFunction(
		"end_pickup_tour",
		() => {
			endPickupTour(ecs);
		},
		false,
	);
};

export const ensureStory = (
	component: InkStoryComponent,
	events: EventBus,
	ecs: ECS,
): Story =>
	ensureStoryWith(component, createStory, (story) =>
		bindExternals(story, events, ecs),
	);
