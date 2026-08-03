import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { getQuest } from "../quest/loader";
import { QuestComponent } from "../quest/quest-component";
import { QUEST_NOTICE_ID } from "./hud-ids";
import type { HudState } from "./hud-state";
import { NoticeComponent } from "./notice-component";
import { profiler } from "../../engine/profiling/profiler";

const MAX_VISIBLE_QUESTS = 3;

const substitute = (
	text: string,
	vars: Readonly<Record<string, string | number>>,
): string => {
	let out = text;
	for (const [key, value] of Object.entries(vars)) {
		out = out
			.replaceAll(`\${${key}}`, String(value))
			.replaceAll(`$${key}`, String(value));
	}
	return out;
};

@profiler("HUD sync", "HUD")
export class HudSyncSystem implements UpdateSystem {
	constructor(private readonly hud: HudState) {}

	update({ ecs }: UpdateContext): void {
		this.hud.setNotice(this.questNoticeText(ecs));
		this.hud.setQuestLines(this.activeLines(ecs));
	}

	/** Text of the live quest toast, or `null` when none is up. */
	private questNoticeText(ecs: UpdateContext["ecs"]): string | null {
		for (const [, notice] of ecs.query(NoticeComponent)) {
			if (notice.slot === QUEST_NOTICE_ID) {
				return notice.text;
			}
		}
		return null;
	}

	private activeLines(ecs: UpdateContext["ecs"]): string[] {
		const lines: string[] = [];
		for (const [, quest] of ecs.query(QuestComponent)) {
			if (lines.length >= MAX_VISIBLE_QUESTS) {
				break;
			}
			const def = getQuest(quest.id);
			if (!def) {
				continue;
			}
			const objective = def.objectives.find(
				(o) => o.activeInStage === quest.stage,
			);
			if (objective) {
				const goal = quest.goals[objective.tag] ?? objective.count;
				const counter = quest.counters[objective.tag] ?? 0;
				lines.push(
					substitute(objective.objectiveText, {
						count: goal,
						kills: counter,
						collected: counter,
						target: objective.tag,
					}),
				);
				continue;
			}
			const stageText = def.stageObjectives?.[quest.stage];
			if (stageText) {
				lines.push(stageText);
			}
		}
		return lines;
	}
}
