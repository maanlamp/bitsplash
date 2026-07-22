import { ShapeTool } from "./shape-tool";
import { type Cell, rectCells } from "./shapes";

/**
 * Rectangle tool: rubber-bands an axis-aligned rectangle. Outline by default;
 * the `shapeFill` option draws the filled variant.
 */
export class RectangleTool extends ShapeTool {
	readonly id = "rectangle" as const;

	protected override fillable(): boolean {
		return true;
	}

	protected cells(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		fill: boolean,
	): ReadonlyArray<Cell> {
		return rectCells(x0, y0, x1, y1, fill);
	}
}
