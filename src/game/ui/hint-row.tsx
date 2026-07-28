import type { ReactNode } from "react";
import { Overlay } from "../../engine/ui/components/overlay";
import { View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";

const HINT_ROW_ID = "hint-row";

const ANCHOR: Style = {
	flexDirection: "column",
	justifyContent: "flex-end",
	alignItems: "flex-end",
	padding: 8,
	pointerEvents: "none",
};

const ROW: Style = {
	flexDirection: "row",
	alignItems: "center",
	gap: 8,
};

export type HintRowProps = Readonly<{ children?: ReactNode }>;

/**
 * The bottom-right corner where every persistent input hint lives, so hints
 * queue up alongside each other instead of stacking on the same pixels.
 *
 * @example
 * <HintRow>
 *   <DialogueAdvanceHint store={dialogue} />
 *   <SkipHint store={skipHint} />
 * </HintRow>
 */
export const HintRow = ({ children }: HintRowProps) => (
	<Overlay id={HINT_ROW_ID} style={ANCHOR}>
		<View style={ROW}>{children}</View>
	</Overlay>
);
