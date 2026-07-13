import {
	Align,
	Edge,
	FlexDirection as YogaFlexDirection,
	Gutter,
	Justify as YogaJustify,
	type Node,
	PositionType as YogaPositionType,
	Wrap,
} from "yoga-layout";
import type { ColorInput } from "../../render/color-resolver";
import type {
	Align as StyleAlign,
	Dimension,
	FlexDirection,
	FlexWrap,
	Justify,
	PositionType,
	Style,
	StyleNineSlice,
} from "./style";

const FLEX_DIRECTION: Record<FlexDirection, YogaFlexDirection> = {
	row: YogaFlexDirection.Row,
	column: YogaFlexDirection.Column,
	"row-reverse": YogaFlexDirection.RowReverse,
	"column-reverse": YogaFlexDirection.ColumnReverse,
};

const JUSTIFY: Record<Justify, YogaJustify> = {
	"flex-start": YogaJustify.FlexStart,
	"flex-end": YogaJustify.FlexEnd,
	center: YogaJustify.Center,
	"space-between": YogaJustify.SpaceBetween,
	"space-around": YogaJustify.SpaceAround,
	"space-evenly": YogaJustify.SpaceEvenly,
};

const ALIGN: Record<StyleAlign, Align> = {
	"flex-start": Align.FlexStart,
	"flex-end": Align.FlexEnd,
	center: Align.Center,
	stretch: Align.Stretch,
	baseline: Align.Baseline,
};

const WRAP: Record<FlexWrap, Wrap> = {
	nowrap: Wrap.NoWrap,
	wrap: Wrap.Wrap,
	"wrap-reverse": Wrap.WrapReverse,
};

const POSITION: Record<PositionType, YogaPositionType> = {
	relative: YogaPositionType.Relative,
	absolute: YogaPositionType.Absolute,
};

const boundValue = (
	value: Dimension | undefined,
): number | `${number}%` | undefined =>
	value === undefined || value === "auto" ? undefined : value;

const applyMargin = (node: Node, style: Style): void => {
	node.setMargin(Edge.All, style.margin);
	node.setMargin(Edge.Top, style.marginTop);
	node.setMargin(Edge.Right, style.marginRight);
	node.setMargin(Edge.Bottom, style.marginBottom);
	node.setMargin(Edge.Left, style.marginLeft);
};

const applyPadding = (node: Node, style: Style): void => {
	node.setPadding(Edge.All, style.padding);
	node.setPadding(Edge.Top, style.paddingTop);
	node.setPadding(Edge.Right, style.paddingRight);
	node.setPadding(Edge.Bottom, style.paddingBottom);
	node.setPadding(Edge.Left, style.paddingLeft);
};

const applyInset = (
	node: Node,
	edge: Edge,
	value: Dimension | undefined,
): void => {
	if (value === undefined) {
		node.setPosition(edge, undefined);
		return;
	}
	if (value === "auto") {
		node.setPositionAuto(edge);
		return;
	}
	node.setPosition(edge, value);
};

export const applyLayoutStyle = (node: Node, style: Style): void => {
	node.setFlexDirection(
		style.flexDirection
			? FLEX_DIRECTION[style.flexDirection]
			: YogaFlexDirection.Column,
	);
	node.setJustifyContent(
		style.justifyContent
			? JUSTIFY[style.justifyContent]
			: YogaJustify.FlexStart,
	);
	node.setAlignItems(
		style.alignItems ? ALIGN[style.alignItems] : Align.Stretch,
	);
	node.setAlignSelf(
		style.alignSelf ? ALIGN[style.alignSelf] : Align.Auto,
	);
	node.setFlexWrap(
		style.flexWrap ? WRAP[style.flexWrap] : Wrap.NoWrap,
	);
	node.setPositionType(
		style.position
			? POSITION[style.position]
			: YogaPositionType.Relative,
	);

	node.setFlexGrow(style.flexGrow);
	node.setFlexShrink(style.flexShrink);
	node.setFlexBasis(style.flexBasis);
	node.setGap(Gutter.All, style.gap);

	node.setWidth(style.width);
	node.setHeight(style.height);
	node.setMinWidth(boundValue(style.minWidth));
	node.setMinHeight(boundValue(style.minHeight));
	node.setMaxWidth(boundValue(style.maxWidth));
	node.setMaxHeight(boundValue(style.maxHeight));

	applyMargin(node, style);
	applyPadding(node, style);
	applyInset(node, Edge.Top, style.top);
	applyInset(node, Edge.Right, style.right);
	applyInset(node, Edge.Bottom, style.bottom);
	applyInset(node, Edge.Left, style.left);
};

export interface PaintStyle {
	color?: ColorInput;
	backgroundColor?: ColorInput;
	alpha?: number;
	nineSlice?: StyleNineSlice;
	textOutline?: ColorInput;
}

export const resolvePaintStyle = (style: Style): PaintStyle => ({
	color: style.color,
	backgroundColor: style.backgroundColor,
	alpha: style.alpha,
	nineSlice: style.nineSlice,
	textOutline: style.textOutline,
});

export const uiStyles = {
	fill: { width: "100%", height: "100%" },
	absoluteFill: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
	},
	row: { flexDirection: "row" },
	column: { flexDirection: "column" },
	center: { justifyContent: "center", alignItems: "center" },
	grow: { flexGrow: 1 },
} as const satisfies Record<string, Style>;
