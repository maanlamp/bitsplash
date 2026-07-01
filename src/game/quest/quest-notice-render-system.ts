import { resolveFont } from "../../engine/text/resolve-font";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { UI_LAYER_MIN } from "../../engine/ui";
import { QuestNoticeComponent } from "../quest/quest-notice-component";
import { withAlpha } from "../fade";
import { UI_SCALE } from "../settings";

const PADDING = 8;

export class QuestNoticeRenderSystem implements RenderSystem {
	render({ renderer, ecs, assetManager }: RenderContext): void {
		const [, notice] = ecs.query(QuestNoticeComponent)[0] ?? [];
		if (!notice) {
			return;
		}
		const font = resolveFont(notice.font, assetManager);
		if (!font) {
			return;
		}
		const alpha = notice.fade.alpha();

		const screenW = renderer.width / UI_SCALE;
		const screenH = renderer.height / UI_SCALE;
		const barHeight = font.lineHeight + PADDING * 2;
		const barY = screenH / 3 - barHeight / 2;

		renderer.drawRect(UI_LAYER_MIN, {
			x: 0,
			y: barY,
			width: screenW,
			height: barHeight,
			fill: withAlpha([0, 0, 0, 1], alpha),
		});
		renderer.drawText(
			UI_LAYER_MIN + 1,
			font,
			notice.text,
			screenW / 2,
			barY + PADDING + font.ascent,
			{
				align: "center",
				color: withAlpha([1, 0.85, 0.4, 1], alpha),
			},
		);
	}
}
