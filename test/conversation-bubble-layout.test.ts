import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { type LoadedFont, loadFontFamily } from "../src/engine/load";
import {
	parseRichText,
	type RichLine,
	wrapRichText,
} from "../src/engine/text/rich-text";
import { findById } from "../src/engine/ui/input/node-tree";
import { blockWidth } from "../src/engine/ui/layout/measure-text";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";
import { UiRuntime } from "../src/engine/ui/ui-runtime";
import { characterById } from "../src/game/character/character-descriptor";
import {
	UNLOADED_BUBBLE_FRAME,
	type BubbleFrame,
} from "../src/game/dialogue/bubble-frame";
import {
	BUBBLE_MAX_TEXT_WIDTH,
	CONVERSATION_UI,
	type MessageView,
	type PortraitFrame,
} from "../src/game/dialogue/conversation-view";
import { messageBubbleId } from "../src/game/dialogue/conversation-nodes";
import { ConversationPanel } from "../src/game/dialogue/conversation-panel";
import { Message } from "../src/game/dialogue/message";
import { SpeechBubble } from "../src/game/dialogue/speech-bubble";
import { realFont } from "./support/real-fonts";
import { mountSync } from "./support/ui-fixture";

const VIEWPORT = 640;

const LONG =
	"The embers do not wink at travellers who arrive after midnight, " +
	"and neither, if you were wondering, do I.";

const SHORT = "Mm.";

const font: LoadedFont = await (async () => {
	const bytes = readFileSync("src/game/content/assets/yoster.ttf");
	const buffer = bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
	return loadFontFamily("yoster", [buffer], 12);
})();

const wrap = (text: string): RichLine[] =>
	wrapRichText(font, parseRichText(text), BUBBLE_MAX_TEXT_WIDTH);

/** A runtime whose measure pass sees the same loaded font the wrap used. */
const measuringUi = (): UiRuntime =>
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

const frame: BubbleFrame = UNLOADED_BUBBLE_FRAME;

const mountBubble = (
	text: string,
	id: string,
): { ui: UiRuntime; lines: RichLine[] } => {
	const lines = wrap(text);
	const ui = measuringUi();
	mountSync(
		ui,
		createElement(SpeechBubble, {
			id,
			glyphsId: `${id}-glyphs`,
			lines,
			font: characterById("bramble").font,
			loadedFont: font,
			frame,
		}),
	);
	ui.layout(1, VIEWPORT, VIEWPORT);
	return { ui, lines };
};

test("a long message wraps at the bubble's maximum text width", () => {
	const lines = wrap(LONG);

	expect(lines.length).toBeGreaterThan(1);
	for (const line of lines) {
		expect(blockWidth(font, [line])).toBeLessThanOrEqual(
			BUBBLE_MAX_TEXT_WIDTH,
		);
	}
});

test("a bubble holding a long message measures non-zero and holds every wrapped line", () => {
	const { ui, lines } = mountBubble(LONG, "long");

	const bubble = rectOf(ui, "long");
	const glyphs = rectOf(ui, "long-glyphs");

	expect(bubble.w).toBeGreaterThan(0);
	expect(bubble.h).toBeGreaterThan(0);
	expect(bubble.w).toBe(
		Math.ceil(blockWidth(font, lines)) +
			CONVERSATION_UI.bubblePadding * 2,
	);
	expect(bubble.w).toBeLessThanOrEqual(
		BUBBLE_MAX_TEXT_WIDTH + CONVERSATION_UI.bubblePadding * 2,
	);
	expect(bubble.h).toBe(
		Math.ceil(lines.length * font.lineHeight) +
			CONVERSATION_UI.bubblePadding * 2,
	);
	expect(glyphs.w).toBe(Math.ceil(blockWidth(font, lines)));
	expect(glyphs.w).toBeLessThanOrEqual(
		bubble.w - CONVERSATION_UI.bubblePadding * 2,
	);
	expect(glyphs.h).toBe(Math.ceil(lines.length * font.lineHeight));
});

test("a bubble shrinks to fit short text rather than taking the maximum width", () => {
	const long = mountBubble(LONG, "long").ui;
	const short = mountBubble(SHORT, "short").ui;

	const wide = rectOf(long, "long");
	const narrow = rectOf(short, "short");

	expect(narrow.w).toBeGreaterThan(0);
	expect(narrow.w).toBeLessThan(wide.w);
	expect(narrow.h).toBeLessThan(wide.h);
});

const view = (
	index: number,
	message: Message,
	text: string,
): MessageView => ({
	index,
	message,
	lines: wrap(text),
	loadedFont: font,
	portrait: null,
	emotionIcon: null,
	bubbleId: messageBubbleId(index),
});

test("a panel lays both alignments out inside its width, npc left and player right", () => {
	const npcText = LONG;
	const playerText = "Then I will bring my own kindling.";
	const ui = measuringUi();
	mountSync(
		ui,
		createElement(ConversationPanel, {
			id: "panel",
			messages: [
				{
					...view(0, new Message("bramble", npcText), npcText),
					bubbleId: "npc-bubble",
				},
				{
					...view(1, new Message("player", playerText), playerText),
					bubbleId: "player-bubble",
				},
			],
			choices: [],
			frame,
		}),
	);
	ui.layout(1, VIEWPORT, VIEWPORT);

	const panel = rectOf(ui, "panel");
	const npc = rectOf(ui, "npc-bubble");
	const player = rectOf(ui, "player-bubble");

	expect(panel.w).toBe(CONVERSATION_UI.panelWidth);
	expect(npc.w).toBeGreaterThan(0);
	expect(player.w).toBeGreaterThan(0);
	expect(npc.h).toBeGreaterThan(0);
	expect(player.h).toBeGreaterThan(0);

	const outerInset =
		CONVERSATION_UI.portraitSize + CONVERSATION_UI.portraitGap;
	const right = panel.x + panel.w;

	expect(npc.x - panel.x).toBeGreaterThanOrEqual(outerInset);
	expect(right - (npc.x + npc.w)).toBeLessThan(outerInset);
	expect(right - (player.x + player.w)).toBeGreaterThanOrEqual(
		outerInset,
	);
	expect(player.x - panel.x).toBeLessThan(outerInset);
	expect(player.y).toBeGreaterThan(npc.y);
});

/**
 * Only the newest row is portrayed in full. A retained row keeps a
 * portrait-width spacer so it stays aligned with the row below it, which is what
 * distinguishes "dropped the portrait" from "slid out to the panel edge".
 */
test("only the newest row carries a portrait, and retained rows stay aligned with it", () => {
	const texts = ["Embers do not wink.", "They do.", "Name one."];
	const portrait: PortraitFrame = {
		image: {} as unknown as PortraitFrame["image"],
		x: 1765,
		y: 10,
		width: CONVERSATION_UI.portraitSize,
		height: CONVERSATION_UI.portraitSize,
	};
	const ui = measuringUi();
	mountSync(
		ui,
		createElement(ConversationPanel, {
			id: "panel",
			messages: texts.map((text, index) => ({
				...view(index, new Message("bramble", text), text),
				bubbleId: `bubble-${index}`,
				portrait,
			})),
			choices: [],
			frame,
		}),
	);
	ui.layout(1, VIEWPORT, VIEWPORT);

	const images = (node: UiNode): UiNode[] =>
		node.type === "image" ? [node] : node.children.flatMap(images);
	const portraits = images(findById(ui.root.tree, "panel") as UiNode);

	expect(portraits).toHaveLength(1);

	const oldest = rectOf(ui, "bubble-0");
	const middle = rectOf(ui, "bubble-1");
	const newest = rectOf(ui, "bubble-2");

	expect(oldest.x).toBe(newest.x);
	expect(middle.x).toBe(newest.x);
	expect(oldest.w).toBeGreaterThan(0);
	expect(middle.w).toBeGreaterThan(0);
});

/** The typefaces the shipped characters actually speak in, at their real size. */
const CHARACTER_IDS = ["player", "bramble", "pennywhistle"] as const;

test("a bubble hugs its text exactly in every typeface a shipped character speaks in", async () => {
	for (const id of CHARACTER_IDS) {
		const settings = characterById(id).font;
		const loaded = await realFont(settings);
		for (const text of [SHORT, LONG]) {
			const lines = wrapRichText(
				loaded,
				parseRichText(text),
				BUBBLE_MAX_TEXT_WIDTH,
			);
			const ui = new UiRuntime({
				resolveFont: () => loaded,
				font: () => loaded,
			});
			mountSync(
				ui,
				createElement(SpeechBubble, {
					id: "bubble",
					glyphsId: "bubble-glyphs",
					lines,
					font: settings,
					loadedFont: loaded,
					frame,
				}),
			);
			ui.layout(1, VIEWPORT, VIEWPORT);

			const bubble = rectOf(ui, "bubble");
			const glyphs = rectOf(ui, "bubble-glyphs");
			const longest = Math.ceil(blockWidth(loaded, lines));
			const padding = CONVERSATION_UI.bubblePadding;

			expect({ id, text, w: bubble.w }).toEqual({
				id,
				text,
				w: longest + padding * 2,
			});
			expect({ id, text, w: glyphs.w }).toEqual({
				id,
				text,
				w: longest,
			});
			expect(glyphs.x - bubble.x).toBe(padding);
			expect(bubble.x + bubble.w - (glyphs.x + glyphs.w)).toBe(
				padding,
			);
			expect(bubble.h).toBe(
				glyphs.h + CONVERSATION_UI.bubblePadding * 2,
			);
		}
	}
});
