import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "../../engine/serialization/serializable-value";
import {
	CHARACTER_IDS,
	type CharacterId,
} from "../character/character-ids";
import {
	EMOTION_IDS,
	type EmotionId,
} from "../character/emotion-ids";

/**
 * Whether a message is spoken aloud or reports on its character from outside —
 * the echo of an unbracketed choice, or the record of a bracketed one.
 */
/**
 * Whether a message is something a character said, or the record of something
 * that happened — a chosen choice's echo, or a bracketed choice's log entry.
 */
export const MESSAGE_KINDS = ["speech", "narration"] as const;

export type MessageKind = (typeof MESSAGE_KINDS)[number];

/**
 * One entry in a conversation transcript: who said it, what they said, and how
 * they looked saying it.
 *
 * The text is **raw**, not pre-wrapped: wrapping needs a loaded font, and the
 * transcript must be appendable while fast-forwarding, before any font has
 * resolved. Only the handful of visible bubbles are wrapped, and lazily.
 *
 * It lives in the game layer because {@link CharacterId} and {@link EmotionId}
 * are game content. Display name, font, portrait and alignment all come from
 * `characterById(message.characterId)` — never from this value.
 *
 * @example
 * const line = new Message("bramble", "Embers don't wink.", "happy");
 * const { displayName, font, isPlayer } = characterById(line.characterId);
 */
@serializable("Message")
export class Message implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize({ options: CHARACTER_IDS }) characterId: CharacterId;
	@serialize() text: string;
	@serialize({ options: EMOTION_IDS }) emotion: EmotionId | null;
	@serialize({ options: MESSAGE_KINDS }) kind: MessageKind;

	constructor(
		characterId: CharacterId = "player",
		text = "",
		emotion: EmotionId | null = null,
		kind: MessageKind = "speech",
	) {
		this.characterId = characterId;
		this.text = text;
		this.emotion = emotion;
		this.kind = kind;
	}
}

/**
 * The rich-text markup a message is wrapped from — its raw text, italicised for
 * narration.
 *
 * Everything that wraps a message wraps *this*, never `message.text`: the
 * conversation panel to paint it and `DialogueSystem` to count the typewriter's
 * glyphs. `<i>` markup changes glyph advances, so two wraps of the same message
 * from different sources would size and count differently.
 *
 * @example
 * const lines = wrapRichText(font, parseRichText(messageMarkup(message)), BUBBLE_MAX_TEXT_WIDTH);
 */
export const messageMarkup = (message: Message): string =>
	message.kind === "narration"
		? `<i>${message.text}</i>`
		: message.text;
