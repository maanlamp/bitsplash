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
import { mirrorQuestStage } from "../quest/quest-mutations";
import { QUEST_NOTICE_ID } from "../ui/hud-ids";
import { NoticeComponent } from "../ui/notice-component";
import {
	DeathEvent,
	PickupCollectedEvent,
	QuestRewardEvent,
} from "../events";
import { getQuest, type QuestReward } from "../quest/loader";
import { profiler } from "../../engine/profiling/profiler";

const NOTICE_FADE_IN = 0.4;
const NOTICE_HOLD = 1.2;
const NOTICE_FADE_OUT = 0.6;

type QuestStage = "offered" | "active" | "return" | "complete";

export const objectiveComplete = (
	count: number,
	goal: number,
): boolean => goal > 0 && count >= goal;

const rewardHandlers: Record<string, (reward: QuestReward) => void> =
	{};

@profiler("Quests", "Quest")
export class QuestSystem implements UpdateSystem {
	update({ ecs, events }: UpdateContext): void {
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
				if (objectiveComplete(next, goal)) {
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
		mirrorQuestStage(ecs, quest.id, state);
		const def = getQuest(quest.id);
		if (!def) {
			return;
		}
		for (const objective of def.objectives) {
			if (objective.activeInStage !== state) {
				continue;
			}
			const goal = quest.goals[objective.tag] ?? objective.count;
			if (
				objectiveComplete(quest.counters[objective.tag] ?? 0, goal)
			) {
				quest.pending = objective.onComplete.to;
			}
		}
		const noticeText = def.stageNotices?.[state];
		if (noticeText) {
			ecs.createEntity([
				new NoticeComponent(
					QUEST_NOTICE_ID,
					noticeText,
					NOTICE_FADE_IN,
					NOTICE_HOLD,
					NOTICE_FADE_OUT,
				),
			]);
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
