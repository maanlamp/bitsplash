import type { Story } from "inkjs";
import type { ECS } from "../../engine/ecs";
import type EventBus from "../../engine/events";
import { QuestDeclinedEvent } from "../events";
import { advanceQuest, startQuest } from "./quest-mutations";

/**
 * Bind the quest externals ink declares (`start_quest`, `advance_quest`,
 * `decline_quest`).
 *
 * `start_quest` and `advance_quest` mutate {@link QuestComponent} directly
 * rather than emitting an event: externals fire from wherever `Continue()` is
 * driven, which includes a sequence op fast-forwarding a knot — after
 * `QuestSystem` has already read the bus this frame, and before it is cleared.
 * A direct write lands regardless of system order.
 */
export const bindQuestExternals = (
	story: Story,
	events: EventBus,
	ecs: ECS,
): void => {
	story.BindExternalFunction(
		"start_quest",
		(quest: string, stage: string) => {
			startQuest(ecs, quest, stage);
		},
		false,
	);
	story.BindExternalFunction(
		"advance_quest",
		(quest: string, to: string) => {
			advanceQuest(ecs, quest, to);
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
};
