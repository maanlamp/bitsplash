import type { ReadonlyECS } from "../../engine/ecs";
import { ConversationComponent } from "./conversation-component";

/**
 * The id of the glyph node that paints the transcript message at `index`.
 *
 * Every visible message gets its own node, so the typewriter reveal can target
 * the newest one alone and leave retained messages fully painted.
 *
 * @example
 * <GlyphText id={messageGlyphsId(view.index)} glyphs={view.lines} />
 */
export const messageGlyphsId = (index: number): string =>
	`dialogue-message-${index}-glyphs`;

/** The panel itself — the node the conversation's focus trap is scoped to. */
export const CONVERSATION_PANEL_ID = "conversation-panel";

/**
 * The id of the focusable row wrapping the transcript message at `index`. Rows
 * are the links of the focus chain that walks history, so their ids are what
 * `focusNeighbors` names.
 */
export const messageRowId = (index: number): string =>
	`dialogue-message-${index}`;

/** The id of the bubble that carries the pop tween for the message at `index`. */
export const messageBubbleId = (index: number): string =>
	`dialogue-message-${index}-bubble`;

/** The id of the focusable row for the pending choice at ink option `index`. */
export const choiceOptionId = (index: number): string =>
	`dialogue-choice-${index}`;

/**
 * Index of the message the session is presenting — the one at the transcript
 * cursor, which is what `DialogueComponent.text` and `revealed` describe. `0`
 * before any transcript exists.
 *
 * It is **not** always the newest message: a multi-block gather parks the cursor
 * on the first of its blocks and steps forward one advance press at a time, and
 * reading history steps it back. The window and `DialogueHudDynSystem` must both
 * derive it the same way, or the typewriter would count out one message's glyphs
 * against another's node.
 */
export const presentedMessageIndex = (ecs: ReadonlyECS): number => {
	const conversation = ecs.queryFirst(ConversationComponent)?.[1];
	if (!conversation || conversation.messages.length === 0) {
		return 0;
	}
	return Math.min(
		Math.max(0, conversation.cursor),
		conversation.messages.length - 1,
	);
};
