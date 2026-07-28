import type { Story } from "inkjs/full";
import type { InkStoryComponent } from "../../engine/ink/ink-story-component";
import type { ECS } from "../../engine/ecs";
import { ensureStory as ensureStoryWith } from "../../engine/ink/story";
import type EventBus from "../../engine/events";
import {
	sequenceDefById,
	startSequence,
} from "../../engine/sequence/sequence-system";
import { bindSetChronicle } from "../chronicle/chronicle-ink-external";
import { bindQuestExternals } from "../quest/quest-ink-external";
import "../sequence/sequence-manifest";
import { createStory } from "./ink-loader";

/**
 * Bind every external the shipped ink declares onto a freshly created story.
 *
 * World-mutating externals write their component directly rather than emitting
 * an event, because externals fire from wherever `Continue()` is driven — which
 * includes a sequence op mid-fast-forward, downstream of the systems that would
 * read such an event, with the bus cleared at frame end.
 */
export const bindInkExternals = (
	story: Story,
	events: EventBus,
	ecs: ECS,
): void => {
	bindQuestExternals(story, events, ecs);
	story.BindExternalFunction(
		"give_item",
		(_item: string, _count: number) => 0,
		false,
	);
	story.BindExternalFunction(
		"start_cutscene",
		(id: string) => {
			startSequence(ecs, sequenceDefById(id));
		},
		false,
	);
	bindSetChronicle(story, ecs);
};

export const ensureStory = (
	component: InkStoryComponent,
	events: EventBus,
	ecs: ECS,
): Story =>
	ensureStoryWith(component, createStory, (story) =>
		bindInkExternals(story, events, ecs),
	);
