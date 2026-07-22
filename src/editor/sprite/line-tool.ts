import { ShapeTool } from "./shape-tool";
import { type Cell, lineCells } from "./shapes";

/** Straight-line tool: rubber-bands a Bresenham line from press to release. */
export class LineTool extends ShapeTool {
	readonly id = "line" as const;

	protected cells(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
	): ReadonlyArray<Cell> {
		return lineCells(x0, y0, x1, y1);
	}
}
