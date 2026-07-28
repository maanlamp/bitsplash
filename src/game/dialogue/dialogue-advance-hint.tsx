import { useSyncExternalStore } from "react";
import { Text, View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import { KeyCap } from "../ui/key-cap";
import type { DialogueHudState } from "./dialogue-hud-state";
import { UI_FONT } from "./dialogue-ui";

export const DIALOGUE_ADVANCE_HINT_ID = "dialogue-advance-hint";

/** Matches `SkipHint`'s label, so the two read as one row of hints. */
const LABEL: Style = {
	color: [1, 1, 1, 1],
	textOutline: [0, 0, 0, 1],
	font: UI_FONT,
	marginRight: 4,
};

export type DialogueAdvanceHintProps = Readonly<{
	store: DialogueHudState;
}>;

/**
 * The keycap telling the player which button moves the conversation on. It shows
 * for as long as a session is open — including mid-reveal, where the same button
 * skips the typewriter instead — because a hint that appeared on every
 * reveal-complete would flicker through the whole exchange.
 *
 * It belongs in the bottom-right hint row, not in the panel, so the panel
 * carries no chrome of its own.
 */
export const DialogueAdvanceHint = ({
	store,
}: DialogueAdvanceHintProps) => {
	const snap = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
	);
	if (!snap.open) {
		return null;
	}
	return (
		<View
			id={DIALOGUE_ADVANCE_HINT_ID}
			style={{ flexDirection: "row", alignItems: "center" }}
		>
			<Text style={LABEL}>Next</Text>
			<KeyCap
				glyph={snap.advanceGlyph}
				font={snap.uiFont ?? undefined}
				frame={snap.kbdFrame}
				insets={snap.kbdInsets}
				icon={snap.advanceIcon}
				activation={snap.advanceActivation}
			/>
		</View>
	);
};
