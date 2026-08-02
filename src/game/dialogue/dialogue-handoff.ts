import type { Story } from "inkjs";
import { DialogueComponent } from "../../engine/dialogue/dialogue-component";
import {
	gatherMessages,
	type MessageBlock,
	NO_SPEAKER_TAGS,
	type SpeakerTags,
} from "../../engine/dialogue/gather-messages";
import type { Seconds } from "../../engine/duration";
import type { ECS, EntityId } from "../../engine/ecs";
import { hasFlagTag } from "../../engine/ink/ink-tags";
import type { UpdateContext } from "../../engine/system";
import type { FontSettings } from "../../engine/text/font-settings";
import { characterById } from "../character/character-descriptor";
import {
	type CharacterId,
	isCharacterId,
} from "../character/character-ids";
import {
	type EmotionId,
	isEmotionId,
} from "../character/emotion-ids";
import {
	CONVERSATION_SLOTS,
	ConversationComponent,
} from "./conversation-component";
import { NARRATE_TAG } from "./dialogue-flag-tags";
import { Message, messageMarkup } from "./message";

/**
 * The option the player just answered a choice with: the text ink offered it as,
 * and the tags authored on it.
 */
type ChosenOption = Readonly<{
	text: string;
	tags: readonly string[];
}>;

/**
 * The transcript of the conversation in progress, created on first use on the
 * sequence entity that owns it so it lives and dies with the whole chain.
 */
export const conversationFor = (
	ecs: ECS,
	sequence: EntityId,
): ConversationComponent => {
	const existing = ecs.getComponent(sequence, ConversationComponent);
	if (existing) {
		return existing;
	}
	const conversation = new ConversationComponent(CONVERSATION_SLOTS);
	ecs.addComponent(sequence, conversation);
	return conversation;
};

const conversationOf = (ecs: ECS): ConversationComponent => {
	const entry = ecs.queryFirst(ConversationComponent);
	if (!entry) {
		throw new Error(
			"dialogue: a session is open with no conversation transcript in the world; every session is created through dialogueHandoff, which makes one",
		);
	}
	return entry[1];
};

/** The tags the session left in effect, as {@link gatherMessages} wants them. */
export const trailingOf = (
	state: DialogueComponent,
): SpeakerTags => ({
	speaker: state.speaker.length > 0 ? state.speaker : null,
	emotion: state.emotion.length > 0 ? state.emotion : null,
});

const storeTrailing = (
	state: DialogueComponent,
	tags: SpeakerTags,
): void => {
	state.speaker = tags.speaker ?? "";
	state.emotion = tags.emotion ?? "";
};

const characterOf = (speaker: string): CharacterId => {
	if (!isCharacterId(speaker)) {
		throw new Error(
			`dialogue: "# speaker: ${speaker}" is not a known character id`,
		);
	}
	return speaker;
};

const emotionOf = (emotion: string | null): EmotionId | null => {
	if (emotion === null) {
		return null;
	}
	if (!isEmotionId(emotion)) {
		throw new Error(
			`dialogue: "# emotion: ${emotion}" is not a known emotion id`,
		);
	}
	return emotion;
};

/**
 * Attribute one gathered block.
 *
 * `gatherMessages` reports the *effective* speaker, so an unbracketed choice's
 * echoed line comes back attributed to whoever was talking when the choice
 * appeared. Comparing the block against the text ink echoed is what recovers it
 * as the player's. Picking a line is saying it, so the echo is **speech** — a
 * full player row, portrait and all — not a record of something that merely
 * happened. It is recorded whether or not the option carries `# narrate`; the tag
 * governs only the bracketed options ink emits nothing for, which are the ones
 * written as summaries rather than as spoken words.
 *
 * Every other block must name a speaker. An untagged block has no character to
 * take its font, portrait or alignment from, so rather than silently attributing
 * it to the player it crashes: the fix is a `# speaker:` tag on the authored
 * line, and `bun run gen` already refuses a knot whose text carries none.
 */
const messageFor = (
	block: MessageBlock,
	chosen: ChosenOption | null,
): Message => {
	if (chosen !== null && block.text === chosen.text) {
		return new Message("player", block.text, null, "speech");
	}
	if (block.speaker === null) {
		throw new Error(
			`dialogue: a block carries no "# speaker:" tag, so there is no character to render it as. Tag the authored line. Block text: ${JSON.stringify(block.text.slice(0, 80))}`,
		);
	}
	return new Message(
		characterOf(block.speaker),
		block.text,
		emotionOf(block.emotion),
		"speech",
	);
};

/**
 * The record a chosen option leaves in the transcript, or `null` when it leaves
 * none.
 *
 * An unbracketed option (`+ You slide a fat purse across the plank.`) is echoed
 * verbatim, so the echo *is* the record — {@link messageFor} turns it into one and
 * a second entry here would duplicate it.
 *
 * A bracketed option (`+ [Refuse]`) is suppressed by ink, so an entry for it has
 * to be written or the decision leaves no trace. That is opt-in: only an option
 * the author tagged `# narrate` gets one, so pure navigation like `[Leave]` stays
 * out of the log.
 */
const choiceRecordFor = (
	blocks: readonly MessageBlock[],
	chosen: ChosenOption | null,
): Message | null => {
	if (chosen === null) {
		return null;
	}
	if (blocks.some((block) => block.text === chosen.text)) {
		return null;
	}
	if (!hasFlagTag(chosen.tags, NARRATE_TAG)) {
		return null;
	}
	return new Message("player", chosen.text, null, "narration");
};

/**
 * Drive the story to its next choice or its end and append every block it
 * produced to the transcript, reporting the tags left in effect and how many
 * messages landed.
 *
 * A chosen option is recorded first, ahead of the response it drew, so the log
 * reads in the order it happened. The cursor moves to the *first* of the new
 * messages, so a multi-block gather is read one advance press at a time rather
 * than arriving all at once.
 */
const recordMessages = (
	conversation: ConversationComponent,
	story: Story,
	tags: SpeakerTags,
	chosen: ChosenOption | null,
): Readonly<{ trailing: SpeakerTags; appended: number }> => {
	const first = conversation.messages.length;
	const gathered = gatherMessages(story, tags);
	const record = choiceRecordFor(gathered.blocks, chosen);
	if (record) {
		conversation.messages.push(record);
	}
	for (const block of gathered.blocks) {
		conversation.messages.push(messageFor(block, chosen));
	}
	const appended = conversation.messages.length - first;
	if (appended > 0) {
		conversation.cursor = first;
	}
	return { trailing: gathered.trailing, appended };
};

/** Park the cursor on the newest message, so nothing is left unread. */
const showNewest = (conversation: ConversationComponent): void => {
	conversation.cursor = Math.max(0, conversation.messages.length - 1);
};

/**
 * Put one message on the session for the typewriter to count out, or clear it
 * (`null`) for a session showing only choices.
 *
 * The session takes the message's **markup** and the speaker's **own font**, so
 * `DialogueSystem` wraps exactly what `ConversationWraps` wraps for the panel —
 * same string, same typeface, and `bindings.textWidth` is the panel's
 * `BUBBLE_MAX_TEXT_WIDTH`. Any of the three differing makes `revealed` count
 * against a glyph total the panel never paints.
 */
const display = (
	state: DialogueComponent,
	story: Story,
	message: Message | null,
	offerChoices: boolean,
): void => {
	state.text = message ? messageMarkup(message) : "";
	if (message) {
		state.font = characterById(message.characterId).font;
	}
	state.choices = offerChoices
		? story.currentChoices.map((choice) => choice.text)
		: [];
	state.choiceTags = offerChoices
		? story.currentChoices.map((choice) => choice.tags ?? [])
		: [];
	state.selectedOption = 0;
	state.wrapped = null;
	state.revealed = 0;
	state.pause = 0 as Seconds;
	state.complete = false;
};

/**
 * Show the message under the cursor, offering the story's choices only once the
 * newest gathered message is the one showing — otherwise a multi-block gather
 * would put its choices up over its first bubble.
 */
const show = (
	conversation: ConversationComponent,
	state: DialogueComponent,
	story: Story,
): void => {
	const pending =
		conversation.cursor < conversation.messages.length - 1;
	display(
		state,
		story,
		conversation.messages[conversation.cursor] ?? null,
		!pending,
	);
};

const advance = (
	conversation: ConversationComponent,
	state: DialogueComponent,
	story: Story,
): boolean => {
	if (conversation.cursor < conversation.messages.length - 1) {
		conversation.cursor += 1;
		show(conversation, state, story);
		return true;
	}
	const answered = state.choices[state.selectedOption];
	const { trailing, appended } = recordMessages(
		conversation,
		story,
		trailingOf(state),
		answered === undefined
			? null
			: {
					text: answered,
					tags: state.choiceTags[state.selectedOption] ?? [],
				},
	);
	storeTrailing(state, trailing);
	if (appended > 0) {
		show(conversation, state, story);
		return true;
	}
	if (story.currentChoices.length === 0) {
		return false;
	}
	display(state, story, null, true);
	return true;
};

/**
 * Put the session's next message on screen — `DialogueSystem`'s `present`
 * binding.
 *
 * One advance press moves one message, always: a gather that produced several
 * blocks steps through them before the story is driven again, and before any of
 * its choices are offered.
 */
export const presentDialogue = (
	ctx: UpdateContext,
	state: DialogueComponent,
	story: Story,
): boolean => advance(conversationOf(ctx.ecs), state, story);

export type FastForwardResult = Readonly<{
	/** The tags in effect where the story stopped. */
	trailing: SpeakerTags;
	/** Whether it stopped on choices, which only the player can answer. */
	halted: boolean;
}>;

/**
 * Play the story from where it stands to its next choice or its end, recording
 * every block it produces in the transcript and leaving nothing unread — the
 * whole of a fast-forward's effect on a conversation.
 *
 * Nothing is echo-attributed here: a fast-forward never answers a choice, it
 * stops at one.
 *
 * @example
 * const { trailing, halted } = fastForwardMessages(conversation, story, NO_SPEAKER_TAGS);
 */
export const fastForwardMessages = (
	conversation: ConversationComponent,
	story: Story,
	tags: SpeakerTags,
): FastForwardResult => {
	const { trailing } = recordMessages(
		conversation,
		story,
		tags,
		null,
	);
	showNewest(conversation);
	return { trailing, halted: story.currentChoices.length > 0 };
};

/**
 * Hand a session back to the player after a fast-forward drove its story on: the
 * transcript's newest message with the pending choices, fully revealed and at
 * rest.
 *
 * The slide tween is *completed* rather than fresh — a fresh `Tween` is not
 * `done()`, so `DialogueSystem` would hold the panel in `entering` and pop it in
 * over 0.3s the conversation has already earned.
 */
export const resumeDialogue = (
	ecs: ECS,
	sequence: EntityId,
	state: DialogueComponent,
	story: Story,
	trailing: SpeakerTags,
): void => {
	storeTrailing(state, trailing);
	state.opened = true;
	state.phase = "open";
	state.slide.retarget(1, 1, 0, "linear");
	const conversation = conversationFor(ecs, sequence);
	showNewest(conversation);
	show(conversation, state, story);
	state.revealed = state.text.length;
};

export type DialogueHandoffSpec = Readonly<{
	ecs: ECS;
	/** The story, already positioned at the op's knot. */
	story: Story;
	/** The sequence entity that owns the conversation transcript. */
	sequence: EntityId;
	/** Whose lines these are, for camera framing and the closed event. */
	source: EntityId | null;
	/**
	 * The typeface a session with nothing on screen falls back to. Every message
	 * the session shows replaces it with its own speaker's font, so this is only
	 * ever read by a session that opened straight onto choices.
	 */
	font: FontSettings;
	/**
	 * The tags a fast-forward left in effect, when the session is being handed
	 * back after one. `null` for a normal open.
	 */
	resumed: SpeakerTags | null;
}>;

export type DialogueSession = Readonly<{
	id: EntityId;
	state: DialogueComponent;
}>;

/**
 * Create the dialogue session for one `dialogue` op — the only place a
 * {@link DialogueComponent} is ever constructed, for a normal open and for a
 * hand-back after a fast-forward alike.
 *
 * A handed-back session opens already `opened`, `phase: "open"` and with a
 * *completed* slide tween: `DialogueSystem` would otherwise re-run its open path
 * over text the fast-forward already produced, and a fresh `Tween` is not
 * `done()`, so the panel would pop in for 0.3s it has already earned.
 *
 * @example
 * const { id } = dialogueHandoff({ ecs, story, sequence: ctx.entityId, source, font, resumed: null });
 */
export const dialogueHandoff = (
	spec: DialogueHandoffSpec,
): DialogueSession => {
	const state = new DialogueComponent(spec.source, spec.font);
	const conversation = conversationFor(spec.ecs, spec.sequence);
	if (spec.resumed) {
		resumeDialogue(
			spec.ecs,
			spec.sequence,
			state,
			spec.story,
			spec.resumed,
		);
	} else {
		storeTrailing(state, NO_SPEAKER_TAGS);
		advance(conversation, state, spec.story);
	}
	const id = spec.ecs.createEntity([state]);
	return { id, state };
};
