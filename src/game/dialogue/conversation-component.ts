import { Tween } from "../../engine/animation/tween";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import { Message } from "./message";

/**
 * How many messages the conversation window keeps on screen at once, and so how
 * many pop tweens a {@link ConversationComponent} carries. The transcript itself
 * is unbounded — this bounds only what is visible.
 */
export const CONVERSATION_SLOTS = 3;

/**
 * The transcript of one conversation, plus the read-back cursor and the pop
 * animation of each visible window slot.
 *
 * It belongs on the **exclusive sequence entity**, so it lives and dies with the
 * whole chain: an `npc-chat` whose ink calls `start_cutscene(...)` queues the
 * cutscene onto that same entity, and `SequenceSystem.finish` reuses it in
 * place — so the two read as one conversation, and the transcript is destroyed
 * only when the chain drains. `SequenceSystem` refuses to queue a non-exclusive
 * def, so that reuse can never hand the entity to an ambient sequence.
 *
 * @example
 * const conversation = new ConversationComponent(CONVERSATION_SLOTS);
 * ecs.addComponent(exclusiveSequenceId, conversation);
 * conversation.messages.push(new Message("bramble", line, "happy"));
 */
@serializable("Conversation")
export class ConversationComponent {
	/** Every message so far, oldest first. */
	@serialize() messages: Message[] = [];

	/**
	 * Index into {@link messages} of the newest message the window shows. Steps
	 * back to read history; the newest message is `messages.length - 1`.
	 */
	@serialize() cursor = 0;

	/** One tween per visible window slot, indexed by slot rather than message. */
	@serialize() slotTweens: Tween[] = [];

	constructor(slots = 0) {
		for (let i = 0; i < slots; i++) {
			this.slotTweens.push(new Tween());
		}
	}
}
