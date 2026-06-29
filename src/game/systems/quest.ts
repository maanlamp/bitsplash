import { InkStoryComponent } from "../../engine/components/ink-story";
import type { Seconds } from "../../engine/duration";
import type { ECS, EntityId } from "../../engine/ecs";
import type EventBus from "../../engine/events";
import { StateEnterEvent } from "../../engine/fsm/events";
import { getDef } from "../../engine/fsm/registry";
import { StateMachineComponent } from "../../engine/fsm/state-machine-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import QuestMarkerTag, { QuestComponent } from "../components/quest";
import { QuestNoticeComponent } from "../components/quest-notice";
import {
	AdvanceQuestEvent,
	DeathEvent,
	PickupCollectedEvent,
	QuestRewardEvent,
	StartQuestEvent,
} from "../events";
import { getQuest, type QuestReward } from "../quest/loader";

const rewardHandlers: Record<string, (reward: QuestReward) => void> =
	{};

export class QuestSystem implements UpdateSystem {
	update({ ecs, events }: UpdateContext): void {
		for (const event of events.read(StartQuestEvent)) {
			this.startQuest(ecs, event.quest, event.stage);
		}
		for (const event of events.read(AdvanceQuestEvent)) {
			this.setTrigger(ecs, event.quest, event.to);
		}
		for (const event of events.read(DeathEvent)) {
			const marker = ecs
				.componentsOf(event.entity)
				.find((c) => c instanceof QuestMarkerTag) as
				| QuestMarkerTag
				| undefined;
			if (marker?.type === "kill") {
				this.trackTagged(ecs, "killTagged");
			}
		}
		for (const event of events.read(PickupCollectedEvent)) {
			const marker = ecs
				.componentsOf(event.entity)
				.find((c) => c instanceof QuestMarkerTag) as
				| QuestMarkerTag
				| undefined;
			if (marker?.type === "collect") {
				this.trackTagged(ecs, "collectTagged");
			}
		}
		for (const event of events.read(StateEnterEvent)) {
			this.onStageEnter(ecs, events, event.entity, event.state);
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
			new QuestComponent(questId, stage, counters, goals),
			new StateMachineComponent(
				getDef(def.fsm),
				def.fsm,
				stage,
				0 as Seconds,
				{},
			),
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

	private setTrigger(ecs: ECS, questId: string, to: string): void {
		const sm = this.questStateMachine(ecs, questId);
		if (sm) {
			sm.params[to] = true;
		}
	}

	private trackTagged(
		ecs: ECS,
		type: "killTagged" | "collectTagged",
	): void {
		for (const [, quest, sm] of ecs.query(
			QuestComponent,
			StateMachineComponent,
		)) {
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
					sm.params[objective.onComplete.to] = true;
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
		const sm = ecs.getComponent(entity, StateMachineComponent);
		if (sm) {
			for (const objective of def.objectives) {
				if (objective.activeInStage !== state) {
					continue;
				}
				const goal = quest.goals[objective.tag] ?? objective.count;
				if ((quest.counters[objective.tag] ?? 0) >= goal) {
					sm.params[objective.onComplete.to] = true;
				}
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

	private questStateMachine(
		ecs: ECS,
		questId: string,
	): StateMachineComponent | null {
		for (const [, quest, sm] of ecs.query(
			QuestComponent,
			StateMachineComponent,
		)) {
			if (quest.id === questId) {
				return sm;
			}
		}
		return null;
	}
}
