import {
	EraserIcon,
	EyedropperIcon,
	HandIcon,
	type Icon,
	PaintBrushIcon,
} from "@phosphor-icons/react";
import type { CursorMode } from "../cursor";
import type { SpriteTool } from "./sprite-editor-state";

export type SpriteToolDef = Readonly<{
	id: SpriteTool;
	label: string;
	icon: Icon;
	shortcut: string;
}>;

export const SPRITE_TOOLS: ReadonlyArray<SpriteToolDef> = [
	{
		id: "paint",
		label: "Brush",
		icon: PaintBrushIcon,
		shortcut: "b",
	},
	{ id: "erase", label: "Eraser", icon: EraserIcon, shortcut: "e" },
	{ id: "pan", label: "Pan", icon: HandIcon, shortcut: "h" },
	{
		id: "pick",
		label: "Pick color",
		icon: EyedropperIcon,
		shortcut: "i",
	},
];

export const toolShowsBrush = (tool: SpriteTool): boolean =>
	tool === "paint" || tool === "erase";

export const cursorForTool = (
	tool: SpriteTool,
	overImage: boolean,
): CursorMode => {
	if (tool === "pan") {
		return "grab";
	}
	if (toolShowsBrush(tool) && overImage) {
		return "hidden";
	}
	return "default";
};
