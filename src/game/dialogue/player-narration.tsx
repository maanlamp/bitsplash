import { View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import { characterById } from "../character/character-descriptor";
import type { BubbleFrame } from "./bubble-frame";
import { BubbleTailRight } from "./bubble-tail-side";
import {
	CONVERSATION_UI,
	type MessageView,
} from "./conversation-view";
import { SpeechBubble } from "./speech-bubble";

const ROW: Style = {
	flexDirection: "row",
	alignItems: "flex-start",
	justifyContent: "flex-end",
	gap: CONVERSATION_UI.portraitGap,
};

/**
 * Keeps the bubble off the panel's right edge by exactly the space a portrait
 * would occupy, so a narration row lines up with the speech rows above and below
 * it instead of jutting further out.
 */
const PORTRAIT_GAP: Style = {
	width: CONVERSATION_UI.portraitSize,
};

const BUBBLE_ROW: Style = {
	flexDirection: "row",
	alignItems: "flex-start",
};

export type PlayerNarrationProps = Readonly<{
	view: MessageView;
	frame: BubbleFrame;
}>;

/**
 * The player's own record of a decision rather than something they said aloud:
 * the echo of an unbracketed choice, or the log entry a bracketed one leaves
 * behind.
 *
 * It keeps the bubble, the right-hand alignment and its place in the focus chain,
 * and drops only the portrait and the speaker label — nobody is pictured saying
 * it. The italics come from the wrap (`<i>` markup around the text), so the
 * measured width and the painted glyphs agree.
 *
 * Narration is the player's by construction — both the echoed and the suppressed
 * choice forms are attributed to `player` — so there is deliberately no
 * left-aligned counterpart and no side prop. An NPC narration would want its own
 * composite, the way `NpcMessage` mirrors `PlayerMessage`.
 *
 * @example
 * <PlayerNarration view={visible[2]} frame={frame} />
 */
export const PlayerNarration = ({
	view,
	frame,
}: PlayerNarrationProps) => {
	const { font } = characterById(view.message.characterId);
	return (
		<View style={ROW}>
			<View style={BUBBLE_ROW}>
				<SpeechBubble
					id={view.bubbleId}
					glyphsId={view.glyphsId}
					lines={view.lines}
					font={font}
					loadedFont={view.loadedFont}
					frame={frame}
				/>
				<BubbleTailRight />
			</View>
			<View style={PORTRAIT_GAP} />
		</View>
	);
};
