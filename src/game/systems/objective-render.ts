import { FontSettings } from "../../engine/font-settings";
import { resolveFont } from "../../engine/resolve-font";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { UI_LAYER_MIN } from "../../engine/ui";
import fsPixelSansUrl from "../assets/fs-pixel-sans-unicode.font.zip?url";
import { QuestComponent } from "../components/quest";
import { getQuest } from "../quest/loader";
import { UI_SCALE } from "../settings";

const MARGIN = 8;

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
		const text = this.activeObjective(ecs);
		if (!text) {
			return;
		}
		const font = resolveFont(this.font, assetManager);
		if (!font) {
			return;
		}
		const screenW = renderer.width / UI_SCALE;
		renderer.drawText(
			UI_LAYER_MIN + 1,
			font,
			text,
			screenW - MARGIN,
			MARGIN + font.ascent,
			{
				align: "right",
				color: [1, 1, 1, 1],
				outline: [0, 0, 0, 1],
			},
		);
	}

	private activeObjective(ecs: RenderContext["ecs"]): string | null {
		for (const [, quest] of ecs.query(QuestComponent)) {
			const def = getQuest(quest.questId);
			if (!def) {
				continue;
			}
			const objective = def.objectives.find(
				(o) => o.activeInStage === quest.stage,
			);
			if (objective) {
				return substitute(objective.objectiveText, {
					count: objective.count,
					kills: quest.counters[objective.tag] ?? 0,
					target: objective.tag,
				});
			}
			const stageText = def.stageObjectives?.[quest.stage];
			if (stageText) {
				return stageText;
			}
		}
		return null;
	}
}
