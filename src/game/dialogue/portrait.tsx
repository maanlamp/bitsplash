import type { ColorInput } from "../../engine/render/color-resolver";
import { Image, View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import { EMOTION_ICON_SIZE } from "../reaction/emotion-icon-atlas";
import type { ResolvedEmotionIcon } from "../reaction/resolve-emotion-icon";
import {
	CONVERSATION_UI,
	type PortraitFrame,
} from "./conversation-view";

const BACKING: ColorInput = [0, 0, 0, 0.5];

const BOX: Style = {
	width: CONVERSATION_UI.portraitSize,
	height: CONVERSATION_UI.portraitSize,
	backgroundColor: BACKING,
};

/**
 * An `image` node has no measure function, so the crop is given the box's size
 * explicitly rather than being left to lay out 0×0.
 */
const CROP: Style = {
	width: CONVERSATION_UI.portraitSize,
	height: CONVERSATION_UI.portraitSize,
};

/**
 * The emotion badge sits in the portrait box's top **outer** corner, absolutely
 * positioned so it overlays the portrait without reflowing the message row. The
 * icon is drawn at its native cell size, since scaling pixel art by a fraction
 * blurs it.
 */
const BADGE_LEFT: Style = {
	position: "absolute",
	left: 0,
	top: 0,
	width: EMOTION_ICON_SIZE,
	height: EMOTION_ICON_SIZE,
};

const BADGE_RIGHT: Style = {
	position: "absolute",
	right: 0,
	top: 0,
	width: EMOTION_ICON_SIZE,
	height: EMOTION_ICON_SIZE,
};

const badge = (
	icon: ResolvedEmotionIcon | null | undefined,
	style: Style,
) =>
	icon ? (
		<Image
			src={icon.image}
			srcX={icon.srcX}
			srcY={icon.srcY}
			srcW={icon.srcW}
			srcH={icon.srcH}
			style={style}
		/>
	) : null;

export type PortraitProps = Readonly<{
	/** The crop to draw, or `null` while the sprite archive is still loading. */
	frame: PortraitFrame | null;
	/**
	 * The speaker's emotion for this message, already resolved against the icon
	 * atlas — `resolveEmotionIcon(assetManager, view.message.emotion)`. Omitted
	 * or `null` draws no badge, which is also what an unresolved atlas yields.
	 */
	emotion?: ResolvedEmotionIcon | null;
}>;

/**
 * A speaker's portrait, facing right — the arrangement for a character sitting
 * on the **left** edge of the panel.
 *
 * The box keeps its size whether or not the sprite has loaded, so a message row
 * never reflows when the portrait appears.
 *
 * @example
 * <Portrait frame={view.portrait} emotion={view.emotionIcon} />
 */
export const Portrait = ({ frame, emotion }: PortraitProps) => (
	<View style={BOX}>
		{frame ? (
			<Image
				src={frame.image}
				srcX={frame.x}
				srcY={frame.y}
				srcW={frame.width}
				srcH={frame.height}
				style={CROP}
			/>
		) : null}
		{badge(emotion, BADGE_LEFT)}
	</View>
);

/**
 * The same portrait mirrored, so it faces left — the arrangement for a character
 * sitting on the **right** edge of the panel. Mirroring does not affect layout.
 * The emotion badge mirrors with it, staying on the outer edge.
 *
 * @example
 * <PortraitFlipped frame={view.portrait} emotion={view.emotionIcon} />
 */
export const PortraitFlipped = ({
	frame,
	emotion,
}: PortraitProps) => (
	<View style={BOX}>
		{frame ? (
			<Image
				src={frame.image}
				srcX={frame.x}
				srcY={frame.y}
				srcW={frame.width}
				srcH={frame.height}
				flipX
				style={CROP}
			/>
		) : null}
		{badge(emotion, BADGE_RIGHT)}
	</View>
);
