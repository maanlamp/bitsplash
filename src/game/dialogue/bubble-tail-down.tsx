import type { ColorInput } from "../../engine/render/color-resolver";
import { View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import { CONVERSATION_UI, scaledUiPx } from "./conversation-view";

const BORDER: ColorInput = [1, 1, 1, 1];
const FILL: ColorInput = [0, 0, 0, 1];

const STEP = 2;

/**
 * Row widths from top to bottom, tapering to a tip. The last row is the tip and
 * stays pure border.
 */
const ROWS = [CONVERSATION_UI.tailLength, 6, 4, 2];

export type BubbleTailDownProps = Readonly<{
	/**
	 * Layout scale, matching the bubble the tail hangs off — `1` for the
	 * conversation panel, `barkBubbleScale(cameraZoom, uiScale)` for a bark.
	 */
	scale?: number;
}>;

/**
 * A bubble tail pointing **down**, for a bubble hanging above its speaker — the
 * world-anchored bark case.
 *
 * Stepped rows of border with a fill inset one pixel on each side, overlapping
 * the bubble by a pixel so the two read as one shape. There is no direction
 * prop; the sideways shapes are `BubbleTailLeft` and `BubbleTailRight`.
 *
 * @example
 * <View style={{ flexDirection: "column", alignItems: "center" }}>
 *   <SpeechBubble … scale={scale} />
 *   <BubbleTailDown scale={scale} />
 * </View>
 */
export const BubbleTailDown = ({
	scale = 1,
}: BubbleTailDownProps = {}) => {
	const step = scaledUiPx(STEP, scale);
	const border = scaledUiPx(1, scale);
	const column: Style = {
		flexDirection: "column",
		alignItems: "center",
		marginTop: -border,
	};
	return (
		<View style={column}>
			{ROWS.map((authored, row) => {
				const width = scaledUiPx(authored, scale);
				return (
					<View
						key={row}
						style={{
							flexDirection: "row",
							width,
							height: step,
							backgroundColor: BORDER,
						}}
					>
						{row === ROWS.length - 1 ? null : (
							<View
								style={{
									marginLeft: border,
									width: Math.max(0, width - border * 2),
									height: step,
									backgroundColor: FILL,
								}}
							/>
						)}
					</View>
				);
			})}
		</View>
	);
};
