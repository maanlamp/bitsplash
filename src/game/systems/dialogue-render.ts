import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { UI_LAYER_MIN } from "../../engine/ui";
import yosterFontUrl from "../assets/yoster.ttf?url";
import { DialogueComponent } from "../components/dialogue";
import { DIALOGUE_UI } from "../dialogue-ui";
import { UI_SCALE } from "../settings";

const WHITE: [number, number, number, number] = [1, 1, 1, 1];

export class DialogueRenderSystem implements RenderSystem {
	render({ renderer, ecs, assetManager, time }: RenderContext): void {
		const entry = ecs.query(DialogueComponent)[0];
		if (!entry) {
			return;
		}
		const dialogue = entry[1];
		const font = assetManager.getFont(yosterFontUrl);
		if (!font) {
			return;
		}

		const screenW = renderer.width / UI_SCALE;
		const screenH = renderer.height / UI_SCALE;
		const panelX = (screenW - DIALOGUE_UI.panelWidth) / 2;
		const panelY =
			screenH - DIALOGUE_UI.panelHeight - DIALOGUE_UI.marginBottom;

		renderer.drawRect(UI_LAYER_MIN, {
			x: panelX,
			y: panelY,
			width: DIALOGUE_UI.panelWidth,
			height: DIALOGUE_UI.panelHeight,
			fill: [0, 0, 0, 1],
		});

		const revealed = Math.floor(dialogue.revealed);
		const textX = panelX + DIALOGUE_UI.padding;
		const baseY = panelY + DIALOGUE_UI.padding + font.ascent;
		const t = time.elapsed;
		let index = 0;
		for (let line = 0; line < dialogue.lines.length; line++) {
			const y = baseY + line * font.lineHeight;
			for (const g of dialogue.lines[line]!.glyphs) {
				if (index >= revealed) {
					return;
				}
				let dx = 0;
				let dy = 0;
				if (g.wave) {
					const phase = index * 0.7;
					dx = Math.sin(t * g.wave.speed + phase) * g.wave.force;
					dy =
						Math.cos(t * g.wave.speed * 1.3 + phase) * g.wave.force;
				}
				renderer.drawGlyph(
					UI_LAYER_MIN + 1,
					font,
					g.glyphId,
					g.style,
					textX + g.x + dx,
					y + dy,
					g.color ?? WHITE,
				);
				index++;
			}
		}
	}
}
