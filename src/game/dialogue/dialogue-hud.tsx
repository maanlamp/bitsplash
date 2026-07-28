import { useSyncExternalStore } from "react";
import { Overlay } from "../../engine/ui/components/overlay";
import type { Style } from "../../engine/ui/style/style";
import { ConversationPanel } from "./conversation-panel";
import { CONVERSATION_PANEL_ID } from "./conversation-nodes";
import { CONVERSATION_UI } from "./conversation-view";
import type { DialogueHudState } from "./dialogue-hud-state";

/**
 * The panel is anchored bottom-centre and the overlay around it is
 * **pointer-transparent**: `PointerRouter` treats an unset `pointerEvents` as
 * opaque, so a full-screen overlay would report a hover every frame dialogue is
 * open and swallow all five mouse buttons plus the wheel — taking mouse-right
 * `interact` / `dialogueAdvance` / `cutsceneSkip` with them. `pointerEvents`
 * inherits, so `ChoiceOption` opts back in on its own.
 */
const ANCHOR: Style = {
	flexDirection: "column",
	justifyContent: "flex-end",
	alignItems: "center",
	paddingBottom: CONVERSATION_UI.marginBottom,
	pointerEvents: "none",
};

export type DialogueHudProps = Readonly<{
	store: DialogueHudState;
}>;

/**
 * The conversation on screen: a bounded window of message bubbles with the
 * pending choices below them, over an undimmed world.
 *
 * Messages outside the window are **unmounted**, not clipped: `walkFocusables`
 * has no clip awareness and `edgesOf` scores candidates from the yoga rect rather
 * than the dyn offset, so a clipped window would keep handing focus to rows that
 * are no longer drawn where they are scored.
 */
export const DialogueHud = ({ store }: DialogueHudProps) => {
	const snap = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
	);
	if (!snap.open || snap.messages.length === 0) {
		return null;
	}
	return (
		<Overlay style={ANCHOR}>
			<ConversationPanel
				id={CONVERSATION_PANEL_ID}
				messages={snap.messages}
				choices={snap.choices}
				frame={snap.frame}
				onChoiceFocus={(index) => store.select(index)}
				onChoiceConfirm={(index) => store.confirm(index)}
				onReadBack={() => store.readBack()}
			/>
		</Overlay>
	);
};
