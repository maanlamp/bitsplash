import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { UI_LAYER_MIN } from "../../engine/ui";
import jacquardFontUrl from "../assets/Jacquard24-Regular.ttf?url";
import { DeathNoticeComponent } from "../components/death-notice";
import { fadeAlpha, withAlpha } from "../fade";
import { UI_SCALE } from "../settings";

const FONT_SIZE = 24;
const PADDING = 8;
const FADE = 1.5;

export class DeathOverlayRenderSystem implements RenderSystem {
	render({ renderer, ecs, assetManager }: RenderContext): void {
		const notice = ecs.query(DeathNoticeComponent)[0];
		if (!notice) {
			return;
		}
		const font = assetManager.getFont(jacquardFontUrl, FONT_SIZE);
		if (!font) {
			return;
		}
		const alpha = fadeAlpha(notice[1].remaining, FADE);

		const screenW = renderer.width / UI_SCALE;
		const screenH = renderer.height / UI_SCALE;
		const barHeight = font.lineHeight + PADDING * 2;
		const barY = (screenH - barHeight) / 2;

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
			"You died",
			screenW / 2,
			barY + PADDING + font.ascent,
			{
				align: "center",
				color: withAlpha([1, 0, 0, 1], alpha),
			},
		);
	}
}
