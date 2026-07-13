import type { NineSliceInsets } from "../../render/nine-slice";
import type { TileSource } from "../../render/renderer-2d";
import type { ViewElementProps } from "./element-props";
import { NineSlice } from "./nine-slice";

export interface PanelProps extends ViewElementProps {
	image: TileSource;
	insets: NineSliceInsets;
	alpha?: number;
	padding?: number;
}

export const Panel = ({
	image,
	insets,
	alpha,
	padding,
	style,
	children,
	...rest
}: PanelProps) => (
	<NineSlice
		{...rest}
		image={image}
		insets={insets}
		alpha={alpha}
		style={{
			padding: padding ?? insets.left,
			flexDirection: "column",
			...style,
		}}
	>
		{children}
	</NineSlice>
);
