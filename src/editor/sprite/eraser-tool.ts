import { StrokeTool } from "./stroke-tool";
import type { StrokeMode } from "./stroke-buffer";

/**
 * The eraser: a freehand stroke that clears cells. Shares every stroke behaviour
 * with the brush (sized/shaped dabs, pixel-perfect, symmetry); it only declares
 * that it erases coverage rather than painting it.
 */
export class EraserTool extends StrokeTool {
	readonly id = "eraser" as const;
	protected readonly mode: StrokeMode = "erase";
}
