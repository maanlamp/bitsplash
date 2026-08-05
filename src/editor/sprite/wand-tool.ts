import type { CursorValue } from "../../engine/cursor/cursor-authority";
import { blankPixels } from "./pixel-buffer";
import { selectionOp, wandMask } from "./selection-mask";
import type {
	SpriteTool,
	ToolContext,
	ToolSession,
} from "./tool-strategy";

/**
 * The magic wand: a primary click flood-selects cells of the active cel by
 * colour similarity to the clicked pixel, within the editor's wand tolerance,
 * either contiguously or globally. The region is combined into the current
 * selection under the modifier op (Shift add, Alt subtract, both intersect,
 * neither replace). It reuses the fill flood logic so wand and bucket agree.
 */
export class WandTool implements SpriteTool {
	readonly id = "wand" as const;

	onDown(ctx: ToolContext, _session: ToolSession): void {
		if (ctx.button !== 0 || !ctx.overImage) {
			return;
		}
		const cel =
			ctx.doc.core.getCel(
				ctx.doc.core.activeLayerId,
				ctx.doc.core.activeFrameIndex,
			) ?? blankPixels(ctx.doc.width, ctx.doc.height);
		ctx.selection.applyRegion(
			wandMask(
				cel,
				ctx.x,
				ctx.y,
				ctx.state.wandTolerance,
				ctx.state.wandContiguous,
			),
			selectionOp(ctx.shiftKey, ctx.altKey),
		);
	}

	cursor(overImage: boolean): CursorValue {
		return overImage ? "crosshair" : "default";
	}
}
