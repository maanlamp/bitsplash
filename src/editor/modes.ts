import {
	CursorIcon,
	EraserIcon,
	HandIcon,
	type Icon,
	LassoIcon,
	PaintBrushIcon,
	PaintBucketIcon,
} from "@phosphor-icons/react";
import type { EditorMode } from "./editor-state";

export type ModeDef = Readonly<{
	id: EditorMode;
	label: string;
	icon: Icon;
	shortcut: string;
}>;

export const MODES: ReadonlyArray<ModeDef> = [
	{
		id: "select",
		label: "Select",
		icon: CursorIcon,
		shortcut: "s",
	},
	{
		id: "paint",
		label: "Brush",
		icon: PaintBrushIcon,
		shortcut: "b",
	},
	{
		id: "eraser",
		label: "Eraser",
		icon: EraserIcon,
		shortcut: "e",
	},
	{
		id: "fill",
		label: "Fill",
		icon: PaintBucketIcon,
		shortcut: "f",
	},
	{
		id: "lasso",
		label: "Lasso",
		icon: LassoIcon,
		shortcut: "l",
	},
	{
		id: "pan",
		label: "Pan",
		icon: HandIcon,
		shortcut: "h",
	},
];
