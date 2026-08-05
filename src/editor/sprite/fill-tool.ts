import { computeFill } from "./flood-fill";
import { blankPixels } from "./pixel-buffer";
import { recordStroke } from "./stroke";
import type {
	SpriteTool,
	ToolContext,
	ToolSession,
} from "./tool-strategy";
import type { CursorValue } from "../../engine/cursor/cursor-authority";

/**
 * The bucket fill: on a primary click it floods the active cel from the clicked
 * cell and paints the matched region in the active color.
 *
 * Contiguity (4-connected region vs. every matching cell) and colour tolerance
 * come from the editor state. Matching reads the active cel's pixels; the region
 * is written through the ink+symmetry paint sink and committed as one undo
 * entry. A single-event gesture — it never opens a live drag, so the controller
 * stays idle after the click.
 */
export class FillTool implements SpriteTool {
	readonly id = "fill" as const;

	onDown(ctx: ToolContext, _session: ToolSession): void {
		if (ctx.button !== 0 || !ctx.overImage) {
			return;
		}
		const cel =
			ctx.doc.core.getCel(
				ctx.doc.core.activeLayerId,
				ctx.doc.core.activeFrameIndex,
			) ?? blankPixels(ctx.doc.width, ctx.doc.height);
		const cells = computeFill(
			cel,
			ctx.x,
			ctx.y,
			ctx.state.fillTolerance,
			ctx.state.fillContiguous,
		);
		if (cells.length === 0) {
			return;
		}
		const snapshot = ctx.doc.core.snapshot();
		ctx.doc.beginStroke();
		for (const [x, y] of cells) {
			ctx.paint(x, y);
		}
		ctx.doc.commitStroke();
		recordStroke(ctx.doc.core, ctx.history, snapshot);
	}

	cursor(overImage: boolean): CursorValue {
		return overImage ? "crosshair" : "default";
	}
}
