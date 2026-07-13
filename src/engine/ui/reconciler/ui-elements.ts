import {
	createElement,
	type ReactElement,
	type ReactNode,
} from "react";
import type { ColorInput } from "../../render/color-resolver";
import type { NineSliceInsets } from "../../render/nine-slice";
import type { TileSource } from "../../render/renderer-2d";
import type { RichLine } from "../../text/rich-text";
import type {
	FocusDirection,
	UiCancelEvent,
	UiClickEvent,
	UiConfirmEvent,
	UiFocusMoveEvent,
	UiPointerEvent,
	UiWheelEvent,
} from "../input/ui-event";
import type { Style } from "../style/style";

export type UiAnchor = {
	world: { x: number; y: number };
	edgeClamp?: boolean;
	pointToward?: { x: number; y: number };
};

export interface ViewProps {
	style?: Style;
	id?: string;
	focusable?: boolean;
	focusGroup?: string;
	focusNeighbors?: Partial<Record<FocusDirection, string>>;
	anchor?: UiAnchor;
	worldLayer?: string;
	onPointerDown?(e: UiPointerEvent): void;
	onPointerUp?(e: UiPointerEvent): void;
	onPointerMove?(e: UiPointerEvent): void;
	onClick?(e: UiClickEvent): void;
	onWheel?(e: UiWheelEvent): void;
	onFocus?(): void;
	onBlur?(): void;
	onFocusMove?(e: UiFocusMoveEvent): boolean | void;
	onConfirm?(e: UiConfirmEvent): void;
	onCancel?(e: UiCancelEvent): void;
	children?: ReactNode;
}

export interface TextProps {
	style?: Style;
	id?: string;
	worldLayer?: string;
	children?: string | number;
}

export interface ImageProps {
	style?: Style;
	src: TileSource;
	srcX?: number;
	srcY?: number;
	srcW?: number;
	srcH?: number;
}

export interface GlyphTextProps {
	style?: Style;
	id?: string;
	glyphs: readonly RichLine[];
}

export interface LineProps {
	style?: Style;
	id?: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	color: ColorInput;
	width?: number;
}

export interface HoldRingProps {
	style?: Style;
	id?: string;
	frame: TileSource;
	insets: NineSliceInsets;
	inner: ColorInput;
	fill: ColorInput;
	outer: ColorInput;
}

export const UI_ELEMENTS = [
	"view",
	"text",
	"image",
	"glyphs",
	"line",
	"holdring",
] as const;

export type UiElementType = (typeof UI_ELEMENTS)[number];

export const View = (props: ViewProps): ReactElement =>
	createElement("view", props);

export const Text = (props: TextProps): ReactElement =>
	createElement("text", props);

export const Image = (props: ImageProps): ReactElement =>
	createElement("image", props);

export const GlyphText = (props: GlyphTextProps): ReactElement =>
	createElement("glyphs", props);

export const Line = (props: LineProps): ReactElement =>
	createElement("line", props);

export const HoldRing = (props: HoldRingProps): ReactElement =>
	createElement("holdring", props);
