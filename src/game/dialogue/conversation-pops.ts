import type { Milliseconds } from "../../engine/duration";
import type { ConversationComponent } from "./conversation-component";
import { conversationWindow } from "./conversation-window";

/** How long a bubble takes to pop into its slot. */
const POP_SECONDS = 0.18;

/** How far below its resting place a bubble starts its pop, in UI pixels. */
export const POP_RISE = 6;

/**
 * Advances the window's pop animations.
 *
 * `slotTweens` are indexed by slot, so a slot's tween is retargeted when a
 * message the window has never shown before lands in it — the arriving bubble
 * pops while the rows that merely shifted up stay at rest. Departing rows
 * unmount rather than animating out: `walkFocusables` has no clip awareness and
 * `edgesOf` reads the yoga rect rather than the dyn offset, so a clipped-away row
 * would keep taking focus at a position it is no longer drawn at.
 *
 * The first window it sees is adopted without retargeting any slot whose tween
 * has already run: those are the restored tweens of a save taken mid-conversation
 * and their bubbles are already on screen, so replaying their pop would be the
 * very flicker serializing `Tween.elapsed` exists to prevent.
 *
 * @example
 * pops.step(conversation, FRAME_MS);
 */
export class ConversationPops {
	private newest = -1;

	/** Tick every slot, retarget the arriving one, and report the window. */
	step(
		conversation: ConversationComponent,
		dt: Milliseconds,
	): readonly number[] {
		const indices = conversationWindow(
			conversation.cursor,
			conversation.messages.length,
		);
		for (
			let slot = 0;
			slot < conversation.slotTweens.length;
			slot++
		) {
			const tween = conversation.slotTweens[slot]!;
			const index = indices[slot];
			const arriving = index !== undefined && index > this.newest;
			const restored =
				this.newest < 0 && (tween.elapsed as number) > 0;
			if (arriving && !restored) {
				tween.retarget(0, 1, POP_SECONDS, "easeOutBack");
			}
			tween.tick(dt);
		}
		for (const index of indices) {
			this.newest = Math.max(this.newest, index);
		}
		return indices;
	}

	/** Forget the window — a conversation's message indices start over at zero. */
	reset(): void {
		this.newest = -1;
	}
}
