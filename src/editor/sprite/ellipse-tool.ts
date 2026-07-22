import { ShapeTool } from "./shape-tool";
import { type Cell, ellipseCells } from "./shapes";

/**
 * Ellipse tool: rubber-bands an ellipse inscribed in the drag's bounding box
 * (integer midpoint rasteriser). Outline by default; the `shapeFill` option
 * draws the filled variant.
 */
export class EllipseTool extends ShapeTool {
	readonly id = "ellipse" as const;

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
		return ellipseCells(x0, y0, x1, y1, fill);
	}
}
