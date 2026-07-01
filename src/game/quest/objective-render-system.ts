import { FontSettings } from "../../engine/font-settings";
import { resolveFont } from "../../engine/resolve-font";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { UI_LAYER_MIN } from "../../engine/ui";
import fsPixelSansUrl from "../content/assets/fs-pixel-sans-unicode.font.zip?url";
import { QuestComponent } from "../quest/quest-component";
import { getQuest } from "../quest/loader";
import { UI_SCALE } from "../settings";

const MARGIN = 8;
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

export class ObjectiveRenderSystem implements RenderSystem {
	private font = new FontSettings(fsPixelSansUrl, 16);

	render({ renderer, ecs, assetManager }: RenderContext): void {
		const lines = this.activeLines(ecs);
		if (lines.length === 0) {
			return;
		}
		const font = resolveFont(this.font, assetManager);
		if (!font) {
			return;
		}
		const screenW = renderer.width / UI_SCALE;
		let y = MARGIN + font.ascent;
		for (const line of lines) {
			renderer.drawText(
				UI_LAYER_MIN + 1,
				font,
				line,
				screenW - MARGIN,
				y,
				{
					align: "right",
					color: [1, 1, 1, 1],
					outline: [0, 0, 0, 1],
				},
			);
			y += font.lineHeight;
		}
	}

	private activeLines(ecs: RenderContext["ecs"]): string[] {
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
