import { View } from "../reconciler/ui-elements";
import type { ViewElementProps } from "./element-props";

export interface OverlayProps extends ViewElementProps {
	alpha?: number;
}

export const Overlay = ({ alpha, style, ...rest }: OverlayProps) => (
	<View
		{...rest}
		style={{
			position: "absolute",
			top: 0,
			right: 0,
			bottom: 0,
			left: 0,
			...style,
			...(alpha === undefined ? null : { alpha }),
		}}
	/>
);
