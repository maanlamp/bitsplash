import type { DialogueComponent } from "../../engine/dialogue/dialogue-component";
import type { NineSliceInsets } from "../../engine/render/nine-slice";
import type { TileSource } from "../../engine/render/renderer-2d";
import type { FontSettings } from "../../engine/text/font-settings";
import type { ActivationMarker } from "../ui/key-cap";
import type { ResolvedInputIcon } from "../ui/input-icon-atlas";
import {
	UNLOADED_BUBBLE_FRAME,
	type BubbleFrame,
} from "./bubble-frame";
import type { ConversationComponent } from "./conversation-component";
import type { ChoiceView, MessageView } from "./conversation-view";
import { hasOlder } from "./conversation-window";

export type DialogueSnapshot = Readonly<{
	open: boolean;
	/** The messages the window shows, oldest first, already wrapped. */
	messages: readonly MessageView[];
	/** The choices pending right now, empty when none are. */
	choices: readonly ChoiceView[];
	frame: BubbleFrame;
	advanceGlyph: string;
	advanceIcon: ResolvedInputIcon | null;
	advanceActivation: ActivationMarker;
	kbdFrame: TileSource | null;
	kbdInsets: NineSliceInsets | undefined;
	uiFont: FontSettings | null;
}>;

const NO_MESSAGES: readonly MessageView[] = [];
const NO_CHOICES: readonly ChoiceView[] = [];

const CLOSED: DialogueSnapshot = {
	open: false,
	messages: NO_MESSAGES,
	choices: NO_CHOICES,
	frame: UNLOADED_BUBBLE_FRAME,
	advanceGlyph: "E",
	advanceIcon: null,
	advanceActivation: "press",
	kbdFrame: null,
	kbdInsets: undefined,
	uiFont: null,
};

const sameMessages = (
	a: readonly MessageView[],
	b: readonly MessageView[],
): boolean => {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		const x = a[i]!;
		const y = b[i]!;
		if (
			x.index !== y.index ||
			x.message !== y.message ||
			x.lines !== y.lines ||
			x.loadedFont !== y.loadedFont ||
			x.portrait !== y.portrait ||
			x.bubbleId !== y.bubbleId ||
			x.glyphsId !== y.glyphsId
		) {
			return false;
		}
	}
	return true;
};

const sameChoices = (
	a: readonly ChoiceView[],
	b: readonly ChoiceView[],
): boolean => {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		const x = a[i]!;
		const y = b[i]!;
		if (
			x.index !== y.index ||
			x.lines !== y.lines ||
			x.font !== y.font ||
			x.selected !== y.selected
		) {
			return false;
		}
	}
	return true;
};

const sameFrame = (a: BubbleFrame, b: BubbleFrame): boolean =>
	a.image === b.image && a.insets === b.insets;

const same = (a: DialogueSnapshot, b: DialogueSnapshot): boolean =>
	a.open === b.open &&
	a.advanceGlyph === b.advanceGlyph &&
	a.advanceIcon === b.advanceIcon &&
	a.advanceActivation === b.advanceActivation &&
	a.kbdFrame === b.kbdFrame &&
	a.kbdInsets === b.kbdInsets &&
	a.uiFont === b.uiFont &&
	sameFrame(a.frame, b.frame) &&
	sameMessages(a.messages, b.messages) &&
	sameChoices(a.choices, b.choices);

/**
 * What the conversation panel renders from, plus the writes its focus and click
 * handlers make back into the live components.
 *
 * The views it publishes are compared field by field rather than by array
 * identity, so a sync system may rebuild the arrays every frame and React still
 * only re-renders when something actually changed.
 */
export class DialogueHudState {
	private snap: DialogueSnapshot = CLOSED;
	private live: DialogueComponent | null = null;
	private conversation: ConversationComponent | null = null;
	private interactive = false;
	private readonly listeners = new Set<() => void>();

	getSnapshot = (): DialogueSnapshot => this.snap;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	setComponent(component: DialogueComponent | null): void {
		this.live = component;
	}

	setConversation(conversation: ConversationComponent | null): void {
		this.conversation = conversation;
	}

	close(): void {
		this.live = null;
		this.conversation = null;
		this.setSnapshot(CLOSED);
	}

	/**
	 * Declare that the conversation was simulated this frame, so it is the panel
	 * the player is acting on and may own the focus chain. Called once per update
	 * by the sync system; {@link takeInteractive} consumes it.
	 */
	markInteractive(): void {
		this.interactive = true;
	}

	/**
	 * Whether the conversation was simulated since this was last asked, clearing
	 * the mark.
	 *
	 * This is how the panel stands down while the game is paused: the sync system
	 * is an update system and does not run then, but the panel stays mounted behind
	 * the pause menu — so without this the conversation's focus trap would hold the
	 * cursor inside a panel the player cannot act on and lock the menu out.
	 */
	takeInteractive(): boolean {
		const was = this.interactive;
		this.interactive = false;
		return was;
	}

	setSnapshot(next: DialogueSnapshot): void {
		if (same(this.snap, next)) {
			return;
		}
		this.snap = next;
		for (const listener of this.listeners) {
			listener();
		}
	}

	select(index: number): void {
		if (this.live) {
			this.live.selectedOption = index;
		}
	}

	confirm(index: number): void {
		if (this.live) {
			this.live.selectedOption = index;
			this.live.pendingConfirm = true;
		}
	}

	/**
	 * Scroll the window one message further back through history, reporting
	 * whether there was anything older than its oldest row to scroll to.
	 *
	 * Rewinding counts the message you were on as read: it finishes that message's
	 * typewriter, so the reveal can never end up counting one message's glyphs out
	 * against another message's node. Coming forward again is the advance press,
	 * which re-presents each message in turn.
	 */
	readBack(): boolean {
		const conversation = this.conversation;
		if (!conversation || !hasOlder(conversation)) {
			return false;
		}
		conversation.cursor -= 1;
		if (this.live) {
			this.live.revealed = this.live.text.length;
		}
		return true;
	}
}
