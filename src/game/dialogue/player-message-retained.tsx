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

export type PlayerMessageRetainedProps = Readonly<{
	view: MessageView;
	frame: BubbleFrame;
}>;

/**
 * An older message from the player: the bubble and its tail, with no portrait and
 * no speaker label.
 *
 * Only the newest row is portrayed in full — see {@link NpcMessageRetained} for
 * why. {@link PlayerMessage} is the full composite, and this one is its mirror in
 * the same sense: right-aligned, tail on the right.
 *
 * @example
 * <PlayerMessageRetained view={visible[1]} frame={frame} />
 */
export const PlayerMessageRetained = ({
	view,
	frame,
}: PlayerMessageRetainedProps) => {
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
