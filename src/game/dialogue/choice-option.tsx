import type { ColorInput } from "../../engine/render/color-resolver";
import type { FocusDirection } from "../../engine/ui/input/ui-event";
import {
	GlyphText,
	View,
} from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import type { BubbleFrame } from "./bubble-frame";
import {
	CONVERSATION_UI,
	type ChoiceView,
} from "./conversation-view";

const IDLE: ColorInput = [1, 1, 1, 1];
const SELECTED: ColorInput = [1, 0.85, 0.4, 1];

const FLAT_BACKGROUND: ColorInput = [0, 0, 0, 0.85];
const SELECTED_BACKGROUND: ColorInput = [0.478, 0.329, 0.063, 1];

const CHOICE_FOCUS_GROUP = "conversation-choices";

const ROW: Style = {
	flexDirection: "row",
	padding: CONVERSATION_UI.bubblePadding,
	/**
	 * `pointerEvents` inherits, and the panel's overlay declares `"none"` so it
	 * cannot swallow the mouse tokens `interact` / `dialogueAdvance` /
	 * `cutsceneSkip` ride on. A choice is the one thing in the panel that *is*
	 * clickable, so it opts back in explicitly.
	 */
	pointerEvents: "auto",
};

export type ChoiceOptionProps = Readonly<{
	view: ChoiceView;
	frame: BubbleFrame;
	/** The row's node id, which the panel assigns along with the focus chain. */
	id: string;
	/** Where this row sits in the conversation's ordered focus chain. */
	focusNeighbors?: Partial<Record<FocusDirection, string>>;
	onFocus?: () => void;
	onConfirm?: () => void;
	onClick?: () => void;
}>;

/**
 * One pending choice, framed in the same bubble as speech so a decision reads as
 * something the player is about to say.
 *
 * Selection is shown by tinting the frame and the text, not by a `"> "` prefix,
 * so the row never shifts as focus moves. Text arrives pre-wrapped and is painted
 * per glyph for the same reason a `SpeechBubble` is: a `text` node would paint
 * its string unwrapped.
 *
 * @example
 * <ChoiceOption
 *   view={choice}
 *   frame={frame}
 *   onFocus={() => store.select(choice.index)}
 *   onConfirm={() => store.confirm(choice.index)}
 * />
 */
export const ChoiceOption = ({
	view,
	frame,
	id,
	focusNeighbors,
	onFocus,
	onConfirm,
	onClick,
}: ChoiceOptionProps) => {
	const tint = view.selected ? SELECTED_BACKGROUND : undefined;
	const style: Style = {
		...ROW,
		...(frame.image && frame.insets
			? {
					nineSlice: { image: frame.image, insets: frame.insets },
					...(tint ? { backgroundColor: tint } : null),
				}
			: { backgroundColor: tint ?? FLAT_BACKGROUND }),
	};
	return (
		<View
			id={id}
			focusable
			focusGroup={CHOICE_FOCUS_GROUP}
			focusNeighbors={focusNeighbors}
			style={style}
			onFocus={onFocus}
			onConfirm={onConfirm}
			onClick={onClick}
		>
			<GlyphText
				glyphs={view.lines}
				style={{
					font: view.font,
					color: view.selected ? SELECTED : IDLE,
				}}
			/>
		</View>
	);
};
