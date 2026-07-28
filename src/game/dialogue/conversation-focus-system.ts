import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import type { UiEventDispatcher } from "../../engine/ui/input/event-dispatcher";
import { findById, handlerOf } from "../../engine/ui/input/node-tree";
import type { UiNode } from "../../engine/ui/reconciler/ui-node";
import type { UiRoot } from "../../engine/ui/reconciler/ui-root";
import {
	choiceOptionId,
	CONVERSATION_PANEL_ID,
} from "./conversation-nodes";
import type { DialogueHudState } from "./dialogue-hud-state";

/**
 * Scopes focus to the conversation panel for as long as one is on screen **and
 * being simulated**, and puts the cursor on the first choice each time a new set
 * of choices appears.
 *
 * The trap is what makes the panel's ordered chain a chain: without it,
 * `FocusNav.resolve` falls back to *every* focusable in the tree, so a pause menu
 * left mounted behind the conversation leaks focus into it. It is also what scopes
 * `W`/`S` to focus navigation — those keys are `moveUp`/`moveDown` everywhere
 * else, and the normalizer only treats them as direction keys while a trap is up.
 *
 * Initial focus deliberately lands on the **first choice** rather than the oldest
 * bubble, so the player's first up-press walks into history instead of out of it.
 *
 * The trap is released whenever the conversation is not simulated — while paused,
 * say, where the panel stays mounted behind the pause menu — so a menu opened over
 * a conversation is never locked out of its own buttons.
 *
 * It runs as a render system because it needs nodes that have been laid out:
 * `collectFocusables` skips anything without a `layoutRect`, and layout runs after
 * the update pass.
 */
export class ConversationFocusSystem extends RenderSystem {
	private anchored: UiNode | null = null;

	constructor(
		private readonly root: UiRoot,
		private readonly dispatcher: UiEventDispatcher,
		private readonly hud: DialogueHudState,
	) {
		super();
	}

	render(_ctx: RenderContext): void {
		const focusNav = this.dispatcher.focusNav;
		const panel = this.hud.takeInteractive()
			? findById(this.root.tree, CONVERSATION_PANEL_ID)
			: null;
		if (!panel) {
			if (focusNav.trap) {
				focusNav.clearTrap();
			}
			this.anchored = null;
			return;
		}
		if (focusNav.trap !== panel) {
			focusNav.setTrap(panel);
		}
		/**
		 * A fresh set of choices is a fresh node — the list unmounts entirely while
		 * the next message reveals — so node identity is what distinguishes "new
		 * choices to anchor onto" from "the player has since walked off them".
		 */
		const first = findById(panel, choiceOptionId(0));
		if (!first || first === this.anchored) {
			this.anchored = first;
			return;
		}
		this.anchored = first;
		focusNav.focus(first);
		handlerOf(first, "onFocus")?.(undefined);
	}
}
