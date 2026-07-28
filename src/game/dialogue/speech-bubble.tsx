import type { LoadedFont } from "../../engine/load";
import type { ColorInput } from "../../engine/render/color-resolver";
import type { FontSettings } from "../../engine/text/font-settings";
import type { RichLine } from "../../engine/text/rich-text";
import { blockWidth } from "../../engine/ui/layout/measure-text";
import {
	GlyphText,
	View,
} from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import type { BubbleFrame } from "./bubble-frame";
import { CONVERSATION_UI, scaledUiPx } from "./conversation-view";

const TEXT: ColorInput = [1, 1, 1, 1];

/** Backing used until `bubble.bsprite` has loaded, so text is never unreadable. */
const FLAT_BACKGROUND: ColorInput = [0, 0, 0, 0.85];

/**
 * The width a bubble takes to hold `lines`: the longest wrapped line plus the
 * bubble's padding on both sides.
 *
 * Rounded up the same way the `glyphs` measure function rounds, so the bubble's
 * content box is never a fraction of a pixel narrower than the glyphs inside it.
 */
const bubbleWidth = (
	font: LoadedFont,
	lines: readonly RichLine[],
	padding: number,
): number =>
	Math.ceil(blockWidth(font, lines as RichLine[])) + padding * 2;

export type SpeechBubbleProps = Readonly<{
	/** Node id, needed only when a system drives this bubble's pop tween. */
	id?: string;
	/** Node id of the glyph node, needed only for a typewriter `reveal`. */
	glyphsId?: string;
	/** Text already wrapped at `BUBBLE_MAX_TEXT_WIDTH`. */
	lines: readonly RichLine[];
	/** The font the glyphs paint in. */
	font: FontSettings;
	/** The same font, loaded — what `lines` were wrapped with and measured from. */
	loadedFont: LoadedFont;
	frame: BubbleFrame;
	/**
	 * Layout scale for the bubble's own fixed measurements, `1` for the
	 * conversation panel. A world-anchored bark lays out at
	 * `barkBubbleScale(cameraZoom, uiScale)` and scales its font with it, so its
	 * padding ring has to follow or the bubble stops hugging its text.
	 */
	scale?: number;
}>;

/**
 * A 9-sliced bubble sized to its own text.
 *
 * It takes **pre-wrapped** lines and paints them per glyph, which is the only
 * combination that both measures and paints correctly: a `text` node paints its
 * raw unwrapped string in one call, and a `glyphs` node's measure ignores the
 * width constraint it is given. Wrapping up-front at a maximum and then setting
 * an explicit width from the longest wrapped line gives a bubble that shrinks to
 * fit short text instead of every bubble being one fixed width.
 *
 * The tail is a **sibling**, never part of this node: the 9-slice stretches its
 * bottom-centre band across the whole destination width, so a baked-in tail
 * would smear.
 *
 * @example
 * <View style={{ flexDirection: "row" }}>
 *   <BubbleTailLeft />
 *   <SpeechBubble lines={wrapped.lines} font={font} loadedFont={loaded} frame={frame} />
 * </View>
 */
export const SpeechBubble = ({
	id,
	glyphsId,
	lines,
	font,
	loadedFont,
	frame,
	scale = 1,
}: SpeechBubbleProps) => {
	const padding = scaledUiPx(CONVERSATION_UI.bubblePadding, scale);
	const style: Style = {
		flexDirection: "column",
		width: bubbleWidth(loadedFont, lines, padding),
		padding,
		...(frame.image && frame.insets
			? { nineSlice: { image: frame.image, insets: frame.insets } }
			: { backgroundColor: FLAT_BACKGROUND }),
	};
	return (
		<View id={id} style={style}>
			<GlyphText
				id={glyphsId}
				glyphs={lines}
				style={{ font, color: TEXT }}
			/>
		</View>
	);
};
