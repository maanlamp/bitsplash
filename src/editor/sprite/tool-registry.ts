import {
	ArrowsOutCardinalIcon,
	CircleIcon,
	CirclesThreeIcon,
	DotsNineIcon,
	EraserIcon,
	EyedropperIcon,
	FrameCornersIcon,
	GradientIcon,
	HandIcon,
	type Icon,
	LassoIcon,
	LineSegmentIcon,
	MagicWandIcon,
	PaintBrushIcon,
	PaintBucketIcon,
	PushPinIcon,
	RectangleIcon,
	SelectionIcon,
	StampIcon,
} from "@phosphor-icons/react";
import { AttachmentTool } from "./attachment-tool";
import { BrushTool } from "./brush-tool";
import { CustomBrushTool } from "./custom-brush-tool";
import { DitherTool } from "./dither-tool";
import { EllipseTool } from "./ellipse-tool";
import { EraserTool } from "./eraser-tool";
import { EyedropperTool } from "./eyedropper-tool";
import { FillTool } from "./fill-tool";
import { FreeTransformTool } from "./free-transform-tool";
import { GradientTool } from "./gradient-tool";
import { LassoTool } from "./lasso-tool";
import { LineTool } from "./line-tool";
import { MarqueeTool } from "./marquee-tool";
import { MoveTool } from "./move-tool";
import { PanTool } from "./pan-tool";
import { RectangleTool } from "./rectangle-tool";
import { ScatterTool } from "./scatter-tool";
import type { SpriteToolId } from "./sprite-tool-id";
import type { SpriteTool } from "./tool-strategy";
import { WandTool } from "./wand-tool";

/**
 * A registry entry: the presentation for the tool palette (label, icon,
 * shortcut) bound to the {@link SpriteTool} strategy that implements it. The
 * palette and keybinds render entirely from this data — there is no per-tool
 * `switch` anywhere.
 */
export type ToolEntry = Readonly<{
	id: SpriteToolId;
	label: string;
	icon: Icon;
	shortcut: string;
	tool: SpriteTool;
}>;

/**
 * All sprite tools, in palette order. Adding a tool is a new entry here plus its
 * id in `sprite-tool-id.ts`; nothing else special-cases the toolset.
 */
export const TOOL_REGISTRY: ReadonlyArray<ToolEntry> = [
	{
		id: "brush",
		label: "Brush",
		icon: PaintBrushIcon,
		shortcut: "b",
		tool: new BrushTool(),
	},
	{
		id: "eraser",
		label: "Eraser",
		icon: EraserIcon,
		shortcut: "e",
		tool: new EraserTool(),
	},
	{
		id: "line",
		label: "Line",
		icon: LineSegmentIcon,
		shortcut: "l",
		tool: new LineTool(),
	},
	{
		id: "rectangle",
		label: "Rectangle",
		icon: RectangleIcon,
		shortcut: "r",
		tool: new RectangleTool(),
	},
	{
		id: "ellipse",
		label: "Ellipse",
		icon: CircleIcon,
		shortcut: "o",
		tool: new EllipseTool(),
	},
	{
		id: "fill",
		label: "Fill",
		icon: PaintBucketIcon,
		shortcut: "g",
		tool: new FillTool(),
	},
	{
		id: "dither",
		label: "Dither brush",
		icon: DotsNineIcon,
		shortcut: "d",
		tool: new DitherTool(),
	},
	{
		id: "gradient",
		label: "Dithered gradient",
		icon: GradientIcon,
		shortcut: "n",
		tool: new GradientTool(),
	},
	{
		id: "scatter",
		label: "Scatter brush",
		icon: CirclesThreeIcon,
		shortcut: "k",
		tool: new ScatterTool(),
	},
	{
		id: "custom-brush",
		label: "Custom brush (captured stamp)",
		icon: StampIcon,
		shortcut: "t",
		tool: new CustomBrushTool(),
	},
	{
		id: "marquee",
		label: "Rectangular marquee",
		icon: SelectionIcon,
		shortcut: "m",
		tool: new MarqueeTool(),
	},
	{
		id: "lasso",
		label: "Lasso",
		icon: LassoIcon,
		shortcut: "q",
		tool: new LassoTool(),
	},
	{
		id: "wand",
		label: "Magic wand",
		icon: MagicWandIcon,
		shortcut: "w",
		tool: new WandTool(),
	},
	{
		id: "move",
		label: "Move selection",
		icon: ArrowsOutCardinalIcon,
		shortcut: "v",
		tool: new MoveTool(),
	},
	{
		id: "transform",
		label: "Free transform (scale/rotate/skew)",
		icon: FrameCornersIcon,
		shortcut: "f",
		tool: new FreeTransformTool(),
	},
	{
		id: "eyedropper",
		label: "Eyedropper",
		icon: EyedropperIcon,
		shortcut: "i",
		tool: new EyedropperTool(),
	},
	{
		id: "attachment",
		label: "Attachment point",
		icon: PushPinIcon,
		shortcut: "a",
		tool: new AttachmentTool(),
	},
	{
		id: "pan",
		label: "Pan",
		icon: HandIcon,
		shortcut: "h",
		tool: new PanTool(),
	},
];

const BY_ID: ReadonlyMap<SpriteToolId, ToolEntry> = new Map(
	TOOL_REGISTRY.map((entry) => [entry.id, entry]),
);

/**
 * Resolve a tool entry by id. The id type guarantees the entry exists, so this
 * never returns `undefined`.
 *
 * @example
 * ```ts
 * const { tool } = getToolEntry(state.tool);
 * tool.onDown?.(ctx, session);
 * ```
 */
export const getToolEntry = (id: SpriteToolId): ToolEntry => {
	const entry = BY_ID.get(id);
	if (!entry) {
		throw new Error(`No tool registered for id "${id}".`);
	}
	return entry;
};

/** Resolve just the strategy for a tool id. */
export const getTool = (id: SpriteToolId): SpriteTool =>
	getToolEntry(id).tool;
