import type { LoadedFont } from "../../engine/load";
import type { TileSource } from "../../engine/render/renderer-2d";
import type { FontSettings } from "../../engine/text/font-settings";
import type { RichLine } from "../../engine/text/rich-text";
import type { ResolvedEmotionIcon } from "../reaction/resolve-emotion-icon";
import type { Message } from "./message";

/**
 * Every fixed measurement the conversation panel and its leaves lay out with, in
 * UI pixels. One table so the wrap width and the widths it is derived from can
 * never drift apart.
 */
export const CONVERSATION_UI = {
	/** Total panel width; message rows stretch to it. */
	panelWidth: 280,
	/** Vertical gap between message rows. */
	messageGap: 4,
	/** Gap between the newest message and the choice list. */
	choicesGap: 6,
	/** Vertical gap between choice rows. */
	choiceGap: 2,
	/** Portrait box, square, matching the portrait tag's 40×40 content rect. */
	portraitSize: 40,
	/** Gap between the portrait and the bubble beside it. */
	portraitGap: 2,
	/** Inner padding between a bubble's frame and its glyphs. */
	bubblePadding: 6,
	/** How far a side tail sticks out from the bubble it hangs off. */
	tailLength: 8,
	/** Gap between the panel's bottom edge and the bottom of the viewport. */
	marginBottom: 8,
} as const;

/**
 * A fixed measurement from {@link CONVERSATION_UI} taken to a bubble's layout
 * scale, rounded to whole layout pixels so pixel art stays crisp.
 *
 * The conversation panel lays out at scale 1; a world-anchored bark lays out at
 * `barkBubbleScale(cameraZoom, uiScale)`, and every fixed measurement inside its
 * bubble has to follow that scale or the padding ring and tail read at the wrong
 * size around text that did scale.
 *
 * @example
 * const padding = scaledUiPx(CONVERSATION_UI.bubblePadding, scale);
 */
export const scaledUiPx = (px: number, scale: number): number =>
	Math.max(1, Math.round(px * scale));

/**
 * The widest a message's text may wrap to: the panel minus the portrait, the
 * tail and the bubble's own padding. Wrapping happens at this **maximum** and a
 * bubble then sizes to its longest wrapped line, so short messages still give
 * short bubbles.
 *
 * @example
 * const wrapped = wrapDialogueText(message.text, font, BUBBLE_MAX_TEXT_WIDTH, bindings);
 */
export const BUBBLE_MAX_TEXT_WIDTH: number =
	CONVERSATION_UI.panelWidth -
	CONVERSATION_UI.portraitSize -
	CONVERSATION_UI.portraitGap -
	CONVERSATION_UI.tailLength -
	CONVERSATION_UI.bubblePadding * 2;

/**
 * One portrait crop: the composed `.bsprite` sheet plus the sub-rect of the
 * portrait frame within it, in the same convention as `SpriteSource`
 * (`x` already includes the frame's horizontal offset into the sheet).
 */
export type PortraitFrame = Readonly<{
	image: TileSource;
	x: number;
	y: number;
	width: number;
	height: number;
}>;

/**
 * Everything one message row needs to render: the transcript entry, its text
 * already wrapped at {@link BUBBLE_MAX_TEXT_WIDTH}, the loaded font those lines
 * were wrapped with, and the speaker's portrait crop.
 *
 * `loadedFont` must be the font `characterById(message.characterId).font`
 * resolves to — it is what the wrap was produced with and what the bubble
 * measures its width from. Produce `lines` and `loadedFont` together.
 *
 * `glyphsId` is set only for the message being presented, whose typewriter
 * `reveal` is driven through the dyn store; retained bubbles carry no `reveal`
 * entry and so read as fully revealed. The pop tween is driven off the *row*
 * node instead (`messageRowId`), not the bubble.
 */
export type MessageView = Readonly<{
	/** Index in the transcript, used as the row's React key. */
	index: number;
	message: Message;
	lines: readonly RichLine[];
	loadedFont: LoadedFont;
	portrait: PortraitFrame | null;
	/**
	 * The speaker's emotion for this message, resolved against the icon atlas —
	 * `null` when the message carries none or the atlas has not loaded, which both
	 * draw no badge.
	 */
	emotionIcon: ResolvedEmotionIcon | null;
	/** Always set; the bubble node's id, which the layout tests address it by. */
	bubbleId: string;
	glyphsId?: string;
}>;

/**
 * One pending choice: its ink option index, its text wrapped at
 * {@link BUBBLE_MAX_TEXT_WIDTH}, the font it is painted in, and whether it
 * currently reads as chosen.
 *
 * Unlike a {@link MessageView} it carries no `loadedFont`: a choice row takes no
 * explicit width, so nothing measures it. Its node id is a prop on the row, not
 * a field here — the panel owns the focus chain and so owns the ids.
 */
export type ChoiceView = Readonly<{
	index: number;
	lines: readonly RichLine[];
	font: FontSettings;
	selected: boolean;
}>;
