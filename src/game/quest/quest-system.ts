import { InkStoryComponent } from "../../engine/ink/ink-story-component";
import type { Seconds } from "../../engine/duration";
import type { ECS, EntityId } from "../../engine/ecs";
import type EventBus from "../../engine/events";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { QuestComponent } from "../quest/quest-component";
import { questLifecycleMachine } from "../quest/quest-lifecycle-def";
import { QuestMarkerTagComponent } from "../quest/quest-marker-tag-component";
import { QuestNoticeComponent } from "../quest/quest-notice-component";
import {
	AdvanceQuestEvent,
	DeathEvent,
	PickupCollectedEvent,
	QuestRewardEvent,
	StartQuestEvent,
} from "../events";
import { getQuest, type QuestReward } from "../quest/loader";

type QuestStage = "offered" | "active" | "return" | "complete";

const rewardHandlers: Record<string, (reward: QuestReward) => void> =
	{};

export class QuestSystem implements UpdateSystem {
	update({ ecs, events }: UpdateContext): void {
		for (const event of events.read(StartQuestEvent)) {
			this.startQuest(ecs, event.quest, event.stage);
		}
		for (const event of events.read(AdvanceQuestEvent)) {
			this.setPending(ecs, event.quest, event.to);
		}
		for (const event of events.read(DeathEvent)) {
			const marker = ecs
				.componentsOf(event.entity)
				.find((c) => c instanceof QuestMarkerTagComponent) as
				| QuestMarkerTagComponent
				| undefined;
			if (marker?.type === "kill") {
				this.trackTagged(ecs, "killTagged");
			}
		}
		for (const event of events.read(PickupCollectedEvent)) {
			const marker = ecs
				.componentsOf(event.entity)
				.find((c) => c instanceof QuestMarkerTagComponent) as
				| QuestMarkerTagComponent
				| undefined;
			if (marker?.type === "collect") {
				this.trackTagged(ecs, "collectTagged");
			}
		}
		for (const [id, quest] of ecs.query(QuestComponent)) {
			const run = {
				current: quest.stage as QuestStage,
				elapsed: 0 as Seconds,
			};
			const ctx = { pending: quest.pending };
			const result = questLifecycleMachine.step(
				run,
				ctx,
				0 as Seconds,
			);
			if (result.entered.length > 0) {
				quest.stage = result.next.current;
				quest.pending = null;
				this.onStageEnter(ecs, events, id, result.next.current);
			}
		}
	}

	private startQuest(ecs: ECS, questId: string, stage: string): void {
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
		this.mirrorStage(ecs, questId, stage);
	}

	private mirrorStage(
		ecs: ECS,
		questId: string,
		stage: string,
	): void {
		const story = ecs.query(InkStoryComponent)[0]?.[1].story;
		if (!story) {
			return;
		}
		const key = `quest_${questId}`;
		if (story.variablesState[key] !== null) {
			story.variablesState[key] = stage;
		}
	}

	private setPending(ecs: ECS, questId: string, to: string): void {
		for (const [, quest] of ecs.query(QuestComponent)) {
			if (quest.id === questId) {
				quest.pending = to;
				return;
			}
		}
	}

	private trackTagged(
		ecs: ECS,
		type: "killTagged" | "collectTagged",
	): void {
		for (const [, quest] of ecs.query(QuestComponent)) {
			const def = getQuest(quest.id);
			if (!def) {
				continue;
			}
			for (const objective of def.objectives) {
				if (
					objective.type !== type ||
					objective.activeInStage !== quest.stage
				) {
					continue;
				}
				const next = (quest.counters[objective.tag] ?? 0) + 1;
				quest.counters[objective.tag] = next;
				const goal = quest.goals[objective.tag] ?? objective.count;
				if (next >= goal) {
					quest.pending = objective.onComplete.to;
				}
			}
		}
	}

	private onStageEnter(
		ecs: ECS,
		events: EventBus,
		entity: EntityId,
		state: string,
	): void {
		const quest = ecs.getComponent(entity, QuestComponent);
		if (!quest) {
			return;
		}
		quest.stage = state;
		this.mirrorStage(ecs, quest.id, state);
		const def = getQuest(quest.id);
		if (!def) {
			return;
		}
		for (const objective of def.objectives) {
			if (objective.activeInStage !== state) {
				continue;
			}
			const goal = quest.goals[objective.tag] ?? objective.count;
			if ((quest.counters[objective.tag] ?? 0) >= goal) {
				quest.pending = objective.onComplete.to;
			}
		}
		const noticeText = def.stageNotices?.[state];
		if (noticeText) {
			ecs.createEntity([new QuestNoticeComponent(noticeText)]);
		}
		for (const reward of def.rewards) {
			if (reward.onStage !== state) {
				continue;
			}
			events.emit(new QuestRewardEvent(quest.id, reward));
			rewardHandlers[reward.type]?.(reward);
		}
	}
}
