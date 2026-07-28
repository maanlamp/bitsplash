import { View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import { characterById } from "../character/character-descriptor";
import type { BubbleFrame } from "./bubble-frame";
import { BubbleTailLeft } from "./bubble-tail-side";
import {
	CONVERSATION_UI,
	type MessageView,
} from "./conversation-view";
import { SpeechBubble } from "./speech-bubble";

const ROW: Style = {
	flexDirection: "row",
	alignItems: "flex-start",
	justifyContent: "flex-start",
	gap: CONVERSATION_UI.portraitGap,
};

/**
 * Holds the width a portrait would take, so a retained row lines up with the
 * newest row's bubble instead of sliding out to the panel edge.
 */
const PORTRAIT_GAP: Style = {
	width: CONVERSATION_UI.portraitSize,
};

const BUBBLE_ROW: Style = {
	flexDirection: "row",
	alignItems: "flex-start",
};

export type NpcMessageRetainedProps = Readonly<{
	view: MessageView;
	frame: BubbleFrame;
}>;

/**
 * An older message from a character who is not the player: the bubble and its
 * tail, with no portrait and no speaker label.
 *
 * Only the newest row is portrayed in full. Three portraits and three labels at a
 * high `uiScale` crowd the screen, and identity is already carried by alignment,
 * typeface and the tail direction — so the window keeps its context while costing
 * a fraction of the space. {@link NpcMessage} is the full composite; the
 * arrangement is the component either way, with no props deciding it.
 *
 * @example
 * <NpcMessageRetained view={visible[0]} frame={frame} />
 */
export const NpcMessageRetained = ({
	view,
	frame,
}: NpcMessageRetainedProps) => {
	const { font } = characterById(view.message.characterId);
	return (
		<View style={ROW}>
			<View style={PORTRAIT_GAP} />
			<View style={BUBBLE_ROW}>
				<BubbleTailLeft />
				<SpeechBubble
					id={view.bubbleId}
					glyphsId={view.glyphsId}
					lines={view.lines}
					font={font}
					loadedFont={view.loadedFont}
					frame={frame}
				/>
			</View>
		</View>
	);
};
