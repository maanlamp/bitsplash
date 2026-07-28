import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import type { EntityId } from "../src/engine/ecs";
import { type LoadedFont, loadFontFamily } from "../src/engine/load";
import { FontSettings } from "../src/engine/text/font-settings";
import {
	parseRichText,
	type RichLine,
	wrapRichText,
} from "../src/engine/text/rich-text";
import { findById } from "../src/engine/ui/input/node-tree";
import { blockWidth } from "../src/engine/ui/layout/measure-text";
import { Text, View } from "../src/engine/ui/reconciler/ui-elements";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";
import type { Style } from "../src/engine/ui/style/style";
import { UiRuntime } from "../src/engine/ui/ui-runtime";
import {
	BarkHud,
	barkBubbleScale,
	barkFontSize,
	barkNodeId,
	barkWrapWidth,
} from "../src/game/dialogue/bark-hud";
import {
	BarkHudState,
	type BarkView,
} from "../src/game/dialogue/bark-hud-state";
import { UNLOADED_BUBBLE_FRAME } from "../src/game/dialogue/bubble-frame";
import {
	BUBBLE_MAX_TEXT_WIDTH,
	CONVERSATION_UI,
	scaledUiPx,
} from "../src/game/dialogue/conversation-view";
import { SpeechBubble } from "../src/game/dialogue/speech-bubble";
import { mountSync } from "./support/ui-fixture";

const VIEWPORT = 1280;

const LONG =
	"Did you hear that? Something moved in the reeds by the water, " +
	"and it was very much larger than a frog.";

/** The panel's own type size, so bark and panel start from one base. */
const BASE_SIZE = 12;

const faceBytes = (): ArrayBuffer => {
	const bytes = readFileSync("src/game/content/assets/yoster.ttf");
	return bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
};

const fontAt = (size: number): Promise<LoadedFont> =>
	loadFontFamily("yoster", [faceBytes()], size);

const baseFont = await fontAt(BASE_SIZE);

/** A runtime whose measure pass sees exactly `font`, as the game's does. */
const measuringUi = (font: LoadedFont): UiRuntime =>
	new UiRuntime({ resolveFont: () => font, font: () => font });

const rectOf = (
	ui: UiRuntime,
	id: string,
): Readonly<{ x: number; y: number; w: number; h: number }> => {
	const node = findById(ui.root.tree, id) as UiNode | null;
	expect(node).not.toBeNull();
	const rect = node?.layoutRect;
	expect(rect).toBeDefined();
	return rect!;
};

const wrapAt = (
	font: LoadedFont,
	text: string,
	maxWidth: number,
): RichLine[] => wrapRichText(font, parseRichText(text), maxWidth);

/** A well-formed {@link EntityId} with a readable stem, for test bookkeeping. */
const entity = (stem: string): EntityId => `${stem}-0-0-0-0`;

const barkView = (
	id: EntityId,
	text: string,
	font: LoadedFont,
	scale: number,
): BarkView => ({
	entity: id,
	text,
	lines: wrapAt(font, text, barkWrapWidth(scale)),
	font: new FontSettings("yoster.ttf", font.size),
	loadedFont: font,
	frame: UNLOADED_BUBBLE_FRAME,
	scale,
});

const mountBarks = (
	views: readonly BarkView[],
	font: LoadedFont,
	uiScale: number,
): UiRuntime => {
	const store = new BarkHudState();
	store.setViews(views);
	const ui = measuringUi(font);
	mountSync(ui, createElement(BarkHud, { store }));
	ui.layout(uiScale, VIEWPORT, VIEWPORT);
	return ui;
};

const SHRINK: Style = { alignSelf: "flex-start" };

test("a text node fed only through dyn measures zero-width, which is why bark text is a prop", () => {
	const ui = measuringUi(baseFont);
	mountSync(
		ui,
		createElement(View, {
			children: [
				createElement(Text, {
					key: "dyn",
					id: "dyn-text",
					style: SHRINK,
				}),
				createElement(Text, {
					key: "props",
					id: "props-text",
					style: SHRINK,
					children: LONG,
				}),
			],
		}),
	);
	const node = findById(ui.root.tree, "dyn-text") as UiNode;
	ui.dyn.set(node.id, { text: LONG });
	ui.layout(1, VIEWPORT, VIEWPORT);

	expect(rectOf(ui, "dyn-text").w).toBe(0);
	expect(rectOf(ui, "props-text").w).toBeGreaterThan(0);
});

test("a bark bubble measures non-zero and wraps at the derived width", () => {
	const scale = barkBubbleScale(3, 3);
	const view = barkView(entity("e1"), LONG, baseFont, scale);
	const ui = mountBarks([view], baseFont, 3);

	const bark = rectOf(ui, barkNodeId(entity("e1")));

	expect(view.lines.length).toBeGreaterThan(1);
	for (const line of view.lines) {
		expect(blockWidth(baseFont, [line])).toBeLessThanOrEqual(
			barkWrapWidth(scale),
		);
	}
	expect(bark.w).toBeGreaterThan(0);
	expect(bark.h).toBeGreaterThan(0);
	expect(bark.w).toBe(
		Math.ceil(blockWidth(baseFont, view.lines as RichLine[])) +
			CONVERSATION_UI.bubblePadding * 2,
	);
	expect(bark.w).toBeLessThanOrEqual(
		barkWrapWidth(scale) + CONVERSATION_UI.bubblePadding * 2,
	);
});

test("a bark's padding ring scales with its text, so the bubble still hugs it", async () => {
	for (const scale of [0.5, 0.75, 1, 1.5, 2]) {
		const font = await fontAt(barkFontSize(BASE_SIZE, scale));
		const view = barkView(entity("e1"), "Halt!", font, scale);
		const ui = mountBarks([view], font, 3);

		const bubble = rectOf(ui, barkNodeId(entity("e1")));
		const padding = scaledUiPx(CONVERSATION_UI.bubblePadding, scale);

		expect({ scale, w: bubble.w }).toEqual({
			scale,
			w:
				Math.ceil(blockWidth(font, view.lines as RichLine[])) +
				padding * 2,
		});
	}
});

test("one node per barking entity, and none for an entity that stopped barking", () => {
	const scale = barkBubbleScale(3, 3);
	const ui = mountBarks(
		[
			barkView(entity("a"), LONG, baseFont, scale),
			barkView(entity("b"), "Over here!", baseFont, scale),
		],
		baseFont,
		3,
	);

	expect(
		findById(ui.root.tree, barkNodeId(entity("a"))),
	).not.toBeNull();
	expect(
		findById(ui.root.tree, barkNodeId(entity("b"))),
	).not.toBeNull();
	expect(findById(ui.root.tree, barkNodeId(entity("c")))).toBeNull();
});

test("the bark bubble's scale is the ratio of uiScale to camera zoom", () => {
	expect(barkBubbleScale(3, 3)).toBe(1);
	expect(barkBubbleScale(2, 4)).toBe(2);
	expect(barkBubbleScale(4, 2)).toBe(0.5);
});

/**
 * Every zoom the shipped cutscenes retarget the camera to, against the demo's
 * `uiScale` of 3 — plus the values the camera glides through between them, which
 * is most of the time a bark is on screen during one.
 */
const ZOOMS = [1.5, 2, 3, 4, 5, 6] as const;

const UI_SCALE = 3;

test("a bark reads at the panel's apparent size at every zoom the cutscenes use", async () => {
	for (const text of ["Halt!", LONG]) {
		const panelLines = wrapAt(baseFont, text, BUBBLE_MAX_TEXT_WIDTH);
		const panelUi = measuringUi(baseFont);
		mountSync(
			panelUi,
			createElement(SpeechBubble, {
				id: "panel-bubble",
				glyphsId: "panel-glyphs",
				lines: panelLines,
				font: new FontSettings("yoster.ttf", BASE_SIZE),
				loadedFont: baseFont,
				frame: UNLOADED_BUBBLE_FRAME,
			}),
		);
		panelUi.layout(UI_SCALE, VIEWPORT, VIEWPORT);
		const panel = rectOf(panelUi, "panel-bubble");

		for (const zoom of ZOOMS) {
			const scale = barkBubbleScale(zoom, UI_SCALE);
			const scaledFont = await fontAt(barkFontSize(BASE_SIZE, scale));
			const barkUi = mountBarks(
				[barkView(entity("e1"), text, scaledFont, scale)],
				scaledFont,
				UI_SCALE,
			);
			const bark = rectOf(barkUi, barkNodeId(entity("e1")));

			// A world-anchored node is drawn in the world pass at camera zoom; the
			// panel is drawn in the UI pass at uiScale. Apparent size is the point.
			const ratio = (bark.w * zoom) / (panel.w * UI_SCALE);

			expect({
				text,
				zoom,
				close: ratio > 0.9 && ratio < 1.1,
			}).toEqual({ text, zoom, close: true });
		}
	}
});
