import {
	CONVERSATION_SLOTS,
	type ConversationComponent,
} from "./conversation-component";

/**
 * The slice of the transcript the window shows: up to {@link CONVERSATION_SLOTS}
 * messages ending at the cursor, oldest first.
 *
 * The cursor is the *newest* message on screen, never a mid-window one — showing
 * anything past it would put unread messages on screen, and stepping it back is
 * how history is read.
 *
 * @example
 * conversationWindow(5, 9); // [3, 4, 5]
 * conversationWindow(0, 9); // [0]
 */
export const conversationWindow = (
	cursor: number,
	count: number,
): readonly number[] => {
	const newest = Math.min(cursor, count - 1);
	if (newest < 0) {
		return [];
	}
	const oldest = Math.max(0, newest - CONVERSATION_SLOTS + 1);
	const out: number[] = [];
	for (let i = oldest; i <= newest; i++) {
		out.push(i);
	}
	return out;
};

/**
 * Whether there is transcript older than the window's first row — the question
 * the panel's top focus edge asks before scrolling the window back.
 */
export const hasOlder = (
	conversation: ConversationComponent,
): boolean =>
	conversationWindow(
		conversation.cursor,
		conversation.messages.length,
	)[0] !== 0;
