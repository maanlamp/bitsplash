import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { getQuest } from "../quest/loader";
import { QuestComponent } from "../quest/quest-component";
import { QuestNoticeComponent } from "../quest/quest-notice-component";
import type { HudState } from "./hud-state";

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

export class HudSyncSystem implements UpdateSystem {
	constructor(private readonly hud: HudState) {}

	update({ ecs }: UpdateContext): void {
		const [, notice] = ecs.query(QuestNoticeComponent)[0] ?? [];
		this.hud.setNotice(notice ? notice.text : null);
		this.hud.setQuestLines(this.activeLines(ecs));
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
