import type { ColorInput } from "../../render/color-resolver";
import type { NineSliceInsets } from "../../render/nine-slice";
import type { TileSource } from "../../render/renderer-2d";
import type { FontSettings } from "../../text/font-settings";

export type FlexDirection =
	| "row"
	| "column"
	| "row-reverse"
	| "column-reverse";

export type Justify =
	| "flex-start"
	| "flex-end"
	| "center"
	| "space-between"
	| "space-around"
	| "space-evenly";

export type Align =
	| "flex-start"
	| "flex-end"
	| "center"
	| "stretch"
	| "baseline";

export type FlexWrap = "nowrap" | "wrap" | "wrap-reverse";

export type PositionType = "relative" | "absolute";

export type Dimension = number | `${number}%` | "auto";

export type StyleNineSlice = Readonly<{
	image: TileSource;
	insets: NineSliceInsets;
}>;

export interface Style {
	flexDirection?: FlexDirection;
	justifyContent?: Justify;
	alignItems?: Align;
	alignSelf?: Align;
	flexGrow?: number;
	flexShrink?: number;
	flexBasis?: Dimension;
	flexWrap?: FlexWrap;
	gap?: number;

	width?: Dimension;
	height?: Dimension;
	minWidth?: Dimension;
	minHeight?: Dimension;
	maxWidth?: Dimension;
	maxHeight?: Dimension;

	margin?: number;
	marginTop?: number;
	marginRight?: number;
	marginBottom?: number;
	marginLeft?: number;

	padding?: number;
	paddingTop?: number;
	paddingRight?: number;
	paddingBottom?: number;
	paddingLeft?: number;

	position?: PositionType;
	overflow?: "visible" | "hidden";
	pointerEvents?: "auto" | "none";
	top?: Dimension;
	right?: Dimension;
	bottom?: Dimension;
	left?: Dimension;

	color?: ColorInput;
	backgroundColor?: ColorInput;
	alpha?: number;
	nineSlice?: StyleNineSlice;
	textOutline?: ColorInput;
	font?: FontSettings;
	textAlign?: "left" | "center" | "right";
	centerInk?: boolean;
}
