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
import { InkStoryComponent } from "../../engine/components/ink-story";
import { QuestComponent } from "../components/quest";
import { QuestNoticeComponent } from "../components/quest-notice";
import { getQuest, type QuestReward } from "../quest/loader";
import {
	AdvanceQuestEvent,
	KillEvent,
	QuestRewardEvent,
	StartQuestEvent,
} from "../events";

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
		for (const event of events.read(KillEvent)) {
			this.trackKill(ecs, event.tags);
		}
		for (const event of events.read(StateEnterEvent)) {
			this.onStageEnter(ecs, events, event.entity, event.state);
		}
	}

	private startQuest(ecs: ECS, questId: string, stage: string): void {
		for (const [, quest] of ecs.query(QuestComponent)) {
			if (quest.questId === questId) {
				return;
			}
		}
		const def = getQuest(questId);
		if (!def) {
			return;
		}
		const counters: Record<string, number> = {};
		for (const objective of def.objectives) {
			counters[objective.tag] = 0;
		}
		ecs.createEntity([
			new QuestComponent(questId, stage, counters),
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

	private trackKill(ecs: ECS, tags: readonly string[]): void {
		for (const [, quest, sm] of ecs.query(
			QuestComponent,
			StateMachineComponent,
		)) {
			const def = getQuest(quest.questId);
			if (!def) {
				continue;
			}
			for (const objective of def.objectives) {
				if (
					objective.type !== "killTagged" ||
					objective.activeInStage !== quest.stage ||
					!tags.includes(objective.tag)
				) {
					continue;
				}
				const next = (quest.counters[objective.tag] ?? 0) + 1;
				quest.counters[objective.tag] = next;
				if (next >= objective.count) {
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
		this.mirrorStage(ecs, quest.questId, state);
		const def = getQuest(quest.questId);
		if (!def) {
			return;
		}
		const noticeText = def.stageNotices?.[state];
		if (noticeText) {
			ecs.createEntity([new QuestNoticeComponent(noticeText)]);
		}
		for (const reward of def.rewards) {
			if (reward.onStage !== state) {
				continue;
			}
			events.emit(new QuestRewardEvent(quest.questId, reward));
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
			if (quest.questId === questId) {
				return sm;
			}
		}
		return null;
	}
}
