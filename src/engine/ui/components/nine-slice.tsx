import type { NineSliceInsets } from "../../render/nine-slice";
import type { TileSource } from "../../render/renderer-2d";
import { View } from "../reconciler/ui-elements";
import type { ViewElementProps } from "./element-props";

export interface NineSliceProps extends ViewElementProps {
	image: TileSource;
	insets: NineSliceInsets;
	alpha?: number;
}

export const NineSlice = ({
	image,
	insets,
	alpha,
	style,
	...rest
}: NineSliceProps) => (
	<View
		{...rest}
		style={{
			...style,
			...(alpha === undefined ? null : { alpha }),
			nineSlice: { image, insets },
		}}
	/>
);
