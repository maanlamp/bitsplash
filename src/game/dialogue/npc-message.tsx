import { View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import { characterById } from "../character/character-descriptor";
import type { BubbleFrame } from "./bubble-frame";
import { BubbleTailLeft } from "./bubble-tail-side";
import {
	CONVERSATION_UI,
	type MessageView,
} from "./conversation-view";
import { Portrait } from "./portrait";
import { SpeakerLabel } from "./speaker-label";
import { SpeechBubble } from "./speech-bubble";

const ROW: Style = {
	flexDirection: "row",
	alignItems: "flex-start",
	justifyContent: "flex-start",
	gap: CONVERSATION_UI.portraitGap,
};

const COLUMN: Style = {
	flexDirection: "column",
	alignItems: "flex-start",
};

const BUBBLE_ROW: Style = {
	flexDirection: "row",
	alignItems: "flex-start",
};

export type NpcMessageProps = Readonly<{
	view: MessageView;
	frame: BubbleFrame;
}>;

/**
 * One message from a character who is **not** the player: portrait on the left
 * outer edge, name above the bubble, bubble inboard with its tail pointing back
 * at the portrait.
 *
 * The arrangement is the component — there are no side or layout props.
 * `PlayerMessage` is the mirrored composite, and which one a message uses comes
 * from `characterById(message.characterId).isPlayer`.
 *
 * @example
 * <NpcMessage view={visible[0]} frame={frame} />
 */
export const NpcMessage = ({ view, frame }: NpcMessageProps) => {
	const { displayName, font } = characterById(
		view.message.characterId,
	);
	return (
		<View style={ROW}>
			<Portrait frame={view.portrait} emotion={view.emotionIcon} />
			<View style={COLUMN}>
				<SpeakerLabel name={displayName} font={font} />
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
		</View>
	);
};
