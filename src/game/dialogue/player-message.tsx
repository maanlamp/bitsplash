import { View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import { characterById } from "../character/character-descriptor";
import type { BubbleFrame } from "./bubble-frame";
import { BubbleTailRight } from "./bubble-tail-side";
import {
	CONVERSATION_UI,
	type MessageView,
} from "./conversation-view";
import { PortraitFlipped } from "./portrait";
import { SpeakerLabel } from "./speaker-label";
import { SpeechBubble } from "./speech-bubble";

const ROW: Style = {
	flexDirection: "row",
	alignItems: "flex-start",
	justifyContent: "flex-end",
	gap: CONVERSATION_UI.portraitGap,
};

const COLUMN: Style = {
	flexDirection: "column",
	alignItems: "flex-end",
};

const BUBBLE_ROW: Style = {
	flexDirection: "row",
	alignItems: "flex-start",
};

export type PlayerMessageProps = Readonly<{
	view: MessageView;
	frame: BubbleFrame;
}>;

/**
 * One message from the player: portrait on the right outer edge and mirrored so
 * it faces inward, name above the bubble, bubble inboard with its tail pointing
 * back at the portrait.
 *
 * The arrangement is the component — there are no side or layout props.
 * `NpcMessage` is the mirrored composite, and which one a message uses comes from
 * `characterById(message.characterId).isPlayer`.
 *
 * @example
 * <PlayerMessage view={visible[1]} frame={frame} />
 */
export const PlayerMessage = ({
	view,
	frame,
}: PlayerMessageProps) => {
	const { displayName, font } = characterById(
		view.message.characterId,
	);
	return (
		<View style={ROW}>
			<View style={COLUMN}>
				<SpeakerLabel name={displayName} font={font} />
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
			</View>
			<PortraitFlipped
				frame={view.portrait}
				emotion={view.emotionIcon}
			/>
		</View>
	);
};
