import { DialogueComponent } from "../../engine/dialogue/dialogue-component";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import type { DynStore } from "../../engine/ui/bypass/dyn-store";
import { nodeStringId } from "../../engine/ui/input/node-tree";
import type { UiNode } from "../../engine/ui/reconciler/ui-node";
import type { UiRoot } from "../../engine/ui/reconciler/ui-root";
import { ConversationComponent } from "./conversation-component";
import {
	CONVERSATION_PANEL_ID,
	messageGlyphsId,
	messageRowId,
	presentedMessageIndex,
} from "./conversation-nodes";
import { POP_RISE } from "./conversation-pops";
import { CONVERSATION_UI } from "./conversation-view";
import { conversationWindow } from "./conversation-window";

const collect = (
	node: UiNode,
	wanted: ReadonlySet<string>,
	found: Map<string, UiNode>,
): void => {
	const id = nodeStringId(node);
	if (id !== null && wanted.has(id)) {
		found.set(id, node);
	}
	for (const child of node.children) {
		collect(child, wanted, found);
	}
};

/**
 * Drives the typewriter reveal of the message being presented, the newest row's
 * pop, and the panel's slide — all through the dyn store, so none of them
 * re-renders React.
 *
 * Only the newest row animates. Every other visible row is pinned at rest each
 * frame rather than left to whatever its slot's tween happens to hold: rows are
 * keyed by message index while tweens are keyed by slot, so a row changes slot as
 * the window slides, and reading a slot's tween would make the whole conversation
 * move when only the arriving bubble should.
 *
 * Only the presented message carries a `reveal` entry: retained messages have
 * none and `DynStore.reveal` defaults to `+Infinity`, so they stay fully painted.
 * The presented message keeps its entry once it completes and is written
 * `+Infinity` explicitly — dropping the entry mid-reveal would leave the last
 * partial count in the store with nothing to raise it, freezing the bubble
 * part-way, which is exactly what pressing advance to skip the typewriter does.
 */
export class DialogueHudDynSystem extends RenderSystem {
	constructor(
		private readonly root: UiRoot,
		private readonly dyn: DynStore,
	) {
		super();
	}

	render({ ecs }: RenderContext): void {
		const [, state] = ecs.queryFirst(DialogueComponent) ?? [];
		const conversation = ecs.queryFirst(ConversationComponent)?.[1];
		if (!state || !conversation) {
			return;
		}
		const window = conversationWindow(
			conversation.cursor,
			conversation.messages.length,
		);
		const glyphsId = messageGlyphsId(presentedMessageIndex(ecs));
		const wanted = new Set<string>([CONVERSATION_PANEL_ID, glyphsId]);
		for (const index of window) {
			wanted.add(messageRowId(index));
		}
		const found = new Map<string, UiNode>();
		collect(this.root.tree, wanted, found);

		const glyphs = found.get(glyphsId);
		if (glyphs) {
			this.dyn.setField(
				glyphs.id,
				"reveal",
				state.complete
					? Number.POSITIVE_INFINITY
					: Math.floor(state.revealed),
			);
		}

		const newestSlot = window.length - 1;
		for (let slot = 0; slot < window.length; slot++) {
			const row = found.get(messageRowId(window[slot]!));
			if (!row) {
				continue;
			}
			const tween = conversation.slotTweens[slot];
			const pop = slot === newestSlot && tween ? tween.value() : 1;
			this.dyn.set(row.id, {
				offsetY: (1 - pop) * POP_RISE,
				alpha: Math.min(1, Math.max(0, pop)),
			});
		}

		const panel = found.get(CONVERSATION_PANEL_ID);
		if (panel) {
			const height = panel.layoutRect?.h ?? 0;
			const slideDistance = height + CONVERSATION_UI.marginBottom;
			const offsetY = (1 - state.slide.value()) * slideDistance;
			this.dyn.setField(panel.id, "offsetY", offsetY);
		}
	}
}
