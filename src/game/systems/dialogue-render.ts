import { FontSettings } from "../../engine/font-settings";
import { resolveFont } from "../../engine/resolve-font";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { UI_LAYER_MIN } from "../../engine/ui";
import { DialogueComponent } from "../../engine/components/dialogue";
import fsPixelSansUrl from "../assets/fs-pixel-sans-unicode.font.zip?url";
import { DIALOGUE_UI } from "../dialogue-ui";
import { withAlpha } from "../fade";
import { UI_SCALE } from "../settings";

const WHITE: [number, number, number, number] = [1, 1, 1, 1];
const ACCENT: [number, number, number, number] = [1, 0.85, 0.4, 1];
const MORE_ALPHA = 0.5;

const PLAYER_FONT = new FontSettings(fsPixelSansUrl);

export class DialogueRenderSystem implements RenderSystem {
	render({ renderer, ecs, assetManager, time }: RenderContext): void {
		const entry = ecs.query(DialogueComponent)[0];
		if (!entry) {
			return;
		}
		const state = entry[1];
		const font = resolveFont(state.font, assetManager);
		if (!font) {
			return;
		}
		const optionFont = resolveFont(PLAYER_FONT, assetManager) ?? font;

		const page = state.pages[state.pageIndex] ?? [];
		const lineCount = Math.max(1, page.length);
		const textRegionH = lineCount * font.lineHeight;

		const lastPage = state.pageIndex >= state.pages.length - 1;
		const choices = state.complete && lastPage ? state.choices : [];
		const optionsH =
			choices.length > 0
				? DIALOGUE_UI.optionGap +
					choices.length * optionFont.lineHeight
				: 0;

		const screenW = renderer.width / UI_SCALE;
		const screenH = renderer.height / UI_SCALE;
		const panelW = DIALOGUE_UI.panelWidth;
		const panelH = DIALOGUE_UI.padding * 2 + textRegionH + optionsH;
		const panelX = (screenW - panelW) / 2;
		const panelY = screenH - panelH - DIALOGUE_UI.marginBottom;

		renderer.drawRect(UI_LAYER_MIN, {
			x: panelX,
			y: panelY,
			width: panelW,
			height: panelH,
			fill: [0, 0, 0, 1],
		});

		const revealed = Math.floor(state.revealed);
		const textX = panelX + DIALOGUE_UI.padding;
		const baseY = panelY + DIALOGUE_UI.padding + font.ascent;
		const t = time.elapsed;
		let index = 0;
		for (let line = 0; line < page.length; line++) {
			const y = baseY + line * font.lineHeight;
			for (const g of page[line]!.glyphs) {
				if (index < revealed) {
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
				}
				index++;
			}
		}

		if (state.complete && !lastPage) {
			renderer.drawText(
				UI_LAYER_MIN + 1,
				font,
				"...",
				panelX + panelW - DIALOGUE_UI.padding,
				baseY + (lineCount - 1) * font.lineHeight,
				{ align: "right", color: withAlpha(WHITE, MORE_ALPHA) },
			);
		}

		const optionBaseY =
			panelY +
			DIALOGUE_UI.padding +
			textRegionH +
			DIALOGUE_UI.optionGap +
			optionFont.ascent;
		for (let i = 0; i < choices.length; i++) {
			const selected = i === state.selectedOption;
			renderer.drawText(
				UI_LAYER_MIN + 1,
				optionFont,
				`${selected ? "> " : "  "}${choices[i]}`,
				textX,
				optionBaseY + i * optionFont.lineHeight,
				{ align: "left", color: selected ? ACCENT : WHITE },
			);
		}
	}
}
