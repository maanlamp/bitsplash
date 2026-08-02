import { InkStoryComponent } from "../../engine/ink/ink-story-component";
import type { ECS, ReadonlyECS } from "../../engine/ecs";
import { getQuest } from "./loader";
import { QuestComponent } from "./quest-component";

/**
 * Write a quest's stage back into the ink variable that authored dialogue reads
 * (`quest_<id>`), so a knot can branch on progress it just caused.
 *
 * Silently skips a quest whose variable the story never declared — an authored
 * quest need not be visible to dialogue at all.
 */
export const mirrorQuestStage = (
	ecs: ReadonlyECS,
	questId: string,
	stage: string,
): void => {
	const story = ecs.queryFirst(InkStoryComponent)?.[1].story;
	if (!story) {
		return;
	}
	const key = `quest_${questId}`;
	if (story.variablesState[key] !== null) {
		story.variablesState[key] = stage;
	}
};

/**
 * Create the quest entity for an authored quest at `stage`, seeding its
 * objective counters and goals from the quest def, and mirror the stage into
 * ink. A quest already present, or an id with no authored def, is a no-op.
 *
 * @example
 * startQuest(ecs, "massacre", "offered");
 */
export const startQuest = (
	ecs: ECS,
	questId: string,
	stage: string,
): void => {
	for (const [, quest] of ecs.query(QuestComponent)) {
		if (quest.id === questId) {
			return;
		}
	}
	const def = getQuest(questId);
	if (!def) {
		return;
	}
	const counters: Record<string, number> = {};
	const goals: Record<string, number> = {};
	for (const objective of def.objectives) {
		counters[objective.tag] = 0;
		goals[objective.tag] = objective.count;
	}
	ecs.createEntity([
		new QuestComponent(questId, stage, counters, goals, null),
	]);
	mirrorQuestStage(ecs, questId, stage);
};

/**
 * Request a stage change on a running quest. The stage itself is entered by
 * `QuestSystem`'s lifecycle machine, which is what validates the transition;
 * this only records the request.
 *
 * @example
 * advanceQuest(ecs, "massacre", "active");
 */
export const advanceQuest = (
	ecs: ReadonlyECS,
	questId: string,
	to: string,
): void => {
	for (const [, quest] of ecs.query(QuestComponent)) {
		if (quest.id === questId) {
			quest.pending = to;
			return;
		}
	}
};
