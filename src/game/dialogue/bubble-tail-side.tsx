import type { ColorInput } from "../../engine/render/color-resolver";
import { View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import { CONVERSATION_UI } from "./conversation-view";

const BORDER: ColorInput = [1, 1, 1, 1];
const FILL: ColorInput = [0, 0, 0, 1];

const STEP = 1;

/**
 * Row widths from top to bottom, forming a horizontal spike whose base is
 * `tailLength` wide. The first and last rows are the tips and stay pure border.
 */
const ROWS = [2, 4, 6, CONVERSATION_UI.tailLength, 6, 4, 2];

const isTip = (row: number): boolean =>
	row === 0 || row === ROWS.length - 1;

const COLUMN: Style = {
	flexDirection: "column",
	marginTop: CONVERSATION_UI.bubblePadding,
};

/**
 * A bubble tail pointing **left**, for a bubble whose speaker sits to its left.
 *
 * Stepped rows of border with a fill inset one pixel along the outer diagonal,
 * overlapping the bubble by a pixel so the two read as one shape. There is no
 * direction prop — {@link BubbleTailRight} is the mirrored shape.
 *
 * @example
 * <View style={{ flexDirection: "row" }}>
 *   <BubbleTailLeft />
 *   <SpeechBubble … />
 * </View>
 */
export const BubbleTailLeft = () => (
	<View
		style={{ ...COLUMN, alignItems: "flex-end", marginRight: -1 }}
	>
		{ROWS.map((width, row) => (
			<View
				key={row}
				style={{
					flexDirection: "row",
					width,
					height: STEP,
					backgroundColor: BORDER,
				}}
			>
				{isTip(row) ? null : (
					<View
						style={{
							marginLeft: 1,
							width: width - 1,
							height: STEP,
							backgroundColor: FILL,
						}}
					/>
				)}
			</View>
		))}
	</View>
);

/**
 * A bubble tail pointing **right**, for a bubble whose speaker sits to its
 * right — the mirror of {@link BubbleTailLeft}.
 *
 * @example
 * <View style={{ flexDirection: "row" }}>
 *   <SpeechBubble … />
 *   <BubbleTailRight />
 * </View>
 */
export const BubbleTailRight = () => (
	<View
		style={{ ...COLUMN, alignItems: "flex-start", marginLeft: -1 }}
	>
		{ROWS.map((width, row) => (
			<View
				key={row}
				style={{
					flexDirection: "row",
					width,
					height: STEP,
					backgroundColor: BORDER,
				}}
			>
				{isTip(row) ? null : (
					<View
						style={{
							width: width - 1,
							height: STEP,
							backgroundColor: FILL,
						}}
					/>
				)}
			</View>
		))}
	</View>
);
