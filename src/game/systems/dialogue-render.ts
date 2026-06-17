import { DialogueComponent } from "../../engine/components/dialogue";
import { FontSettings } from "../../engine/font-settings";
import { type LoadedFont, STYLE_REGULAR } from "../../engine/load";
import { nineSliceInsets } from "../../engine/png-metadata";
import {
	drawNineSlice,
	type NineSliceInsets,
} from "../../engine/render/nine-slice";
import { resolveFont } from "../../engine/resolve-font";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { UI_LAYER_MIN } from "../../engine/ui";
import fsPixelSansUrl from "../assets/fs-pixel-sans-unicode.font.zip?url";
import { DIALOGUE_UI } from "../dialogue-ui";
import { withAlpha } from "../fade";
import { UI_SCALE } from "../settings";

const FALLBACK_INSETS: NineSliceInsets = {
	left: 6,
	right: 6,
	top: 6,
	bottom: 7,
	gap: 2,
};

const TEXT: [number, number, number, number] = [0, 0, 0, 1];
const ACCENT: [number, number, number, number] = [
	0.478, 0.329, 0.063, 1,
];
const MORE_ALPHA = 0.5;

const PLAYER_FONT = new FontSettings(fsPixelSansUrl);

type Metrics = Readonly<{
	ex: number;
	above: number;
	below: number;
	line: number;
}>;

const metricsOf = (font: LoadedFont): Metrics => {
	const face = font.faces[STYLE_REGULAR];
	const x = face.glyphCache.get(face.shape.glyphId(120));
	const ex = x ? x.bearingY : font.ascent / 2;
	return {
		ex,
		above: font.ascent - ex,
		below: font.lineHeight - font.ascent,
		line: font.lineHeight,
	};
};

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

		const tm = metricsOf(font);
		const om = metricsOf(optionFont);

		const page = state.pages[state.pageIndex] ?? [];
		const lineCount = Math.max(1, page.length);

		const lastPage = state.pageIndex >= state.pages.length - 1;
		const choices = state.complete && lastPage ? state.choices : [];

		const insets =
			nineSliceInsets(
				assetManager.getImageMetadata(state.panel) || null,
			) ?? FALLBACK_INSETS;

		const lastTextBaseline = (lineCount - 1) * tm.line + tm.ex;
		let contentBottom = lastTextBaseline;
		let lastBelow = tm.below;
		let optionsTop = 0;
		if (choices.length > 0) {
			optionsTop = lastTextBaseline + DIALOGUE_UI.optionGap;
			contentBottom =
				optionsTop + (choices.length - 1) * om.line + om.ex;
			lastBelow = om.below;
		}

		const topInset = Math.max(DIALOGUE_UI.padding, tm.above);
		const bottomInset = Math.max(DIALOGUE_UI.padding, lastBelow);

		const screenW = renderer.width / UI_SCALE;
		const screenH = renderer.height / UI_SCALE;
		const panelW = DIALOGUE_UI.panelWidth;
		const panelH = Math.round(topInset + contentBottom + bottomInset);
		const panelX = Math.round((screenW - panelW) / 2);
		const restY = screenH - panelH - DIALOGUE_UI.marginBottom;
		const slideDistance = panelH + DIALOGUE_UI.marginBottom;
		const panelY = Math.round(
			restY + (1 - state.slide.value()) * slideDistance,
		);

		const panel = assetManager.getImage(state.panel);
		if (panel) {
			drawNineSlice(renderer, UI_LAYER_MIN, panel, {
				x: panelX,
				y: panelY,
				width: panelW,
				height: panelH,
				insets,
			});
		}

		const revealed = Math.floor(state.revealed);
		const textX = panelX + DIALOGUE_UI.padding;
		const baseY = panelY + topInset + tm.ex;
		const t = time.elapsed;
		let index = 0;
		for (let line = 0; line < page.length; line++) {
			const y = baseY + line * tm.line;
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
						g.color ?? TEXT,
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
				baseY + (lineCount - 1) * tm.line,
				{ align: "right", color: withAlpha(TEXT, MORE_ALPHA) },
			);
		}

		const optionBaseY = panelY + topInset + optionsTop + om.ex;
		for (let i = 0; i < choices.length; i++) {
			const selected = i === state.selectedOption;
			renderer.drawText(
				UI_LAYER_MIN + 1,
				optionFont,
				`${selected ? "> " : "  "}${choices[i]}`,
				textX,
				optionBaseY + i * om.line,
				{ align: "left", color: selected ? ACCENT : TEXT },
			);
		}
	}
}
