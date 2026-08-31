import { CursorIcon } from "@phosphor-icons/react/dist/icons/Cursor";
import { EraserIcon } from "@phosphor-icons/react/dist/icons/Eraser";
import { HandIcon } from "@phosphor-icons/react/dist/icons/Hand";
import { LassoIcon } from "@phosphor-icons/react/dist/icons/Lasso";
import { PaintBrushIcon } from "@phosphor-icons/react/dist/icons/PaintBrush";
import { PaintBucketIcon } from "@phosphor-icons/react/dist/icons/PaintBucket";
import type { Icon } from "@phosphor-icons/react/dist/lib/types";
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
