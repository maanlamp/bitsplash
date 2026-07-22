import { StrokeTool } from "./stroke-tool";
import type { StrokeMode } from "./stroke-buffer";

/**
 * The paint brush: a freehand stroke in the active color. Brush size and shape
 * (round/square) come from the editor state via the shared dab stamping, and
 * the pixel-perfect / symmetry modifiers compose through the stroke path — the
 * strategy itself only declares that it paints.
 */
export class BrushTool extends StrokeTool {
	readonly id = "brush" as const;
	protected readonly mode: StrokeMode = "paint";
}
