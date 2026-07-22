import type { CursorValue } from "../../engine/cursor/cursor-authority";
import { lassoMask, selectionOp } from "./selection-mask";
import type {
	SpriteTool,
	ToolContext,
	ToolSession,
} from "./tool-strategy";

/**
 * The freehand lasso. A primary drag traces a path; on release the closed path
 * is filled into a selection mask (even-odd) and combined into the current
 * selection under the modifier op (Shift add, Alt subtract, both intersect,
 * neither replace). A path of fewer than two distinct cells selects nothing.
 */
export class LassoTool implements SpriteTool {
	readonly id = "lasso" as const;

	onDown(ctx: ToolContext, session: ToolSession): void {
		if (ctx.button !== 0 || !ctx.overImage) {
			return;
		}
		const op = selectionOp(ctx.shiftKey, ctx.altKey);
		const points: Array<[number, number]> = [[ctx.x, ctx.y]];
		session.active = true;
		session.selectionDrag = {
			mode: "lasso",
			ax: ctx.x,
			ay: ctx.y,
			op,
			points,
		};
		ctx.selection.setPreview({ kind: "lasso", points });
		ctx.capture();
	}

	onMove(ctx: ToolContext, session: ToolSession): void {
		const drag = session.selectionDrag;
		if (!drag || drag.mode !== "lasso") {
			return;
		}
		const last = drag.points[drag.points.length - 1];
		if (!last || last[0] !== ctx.x || last[1] !== ctx.y) {
			drag.points.push([ctx.x, ctx.y]);
		}
		ctx.selection.setPreview({ kind: "lasso", points: drag.points });
	}

	onUp(ctx: ToolContext, session: ToolSession): void {
		const drag = session.selectionDrag;
		if (!drag) {
			return;
		}
		session.active = false;
		session.selectionDrag = null;
		ctx.selection.setPreview(null);
		if (drag.points.length < 2) {
			return;
		}
		ctx.selection.applyRegion(
			lassoMask(ctx.doc.width, ctx.doc.height, drag.points),
			drag.op,
		);
	}

	onCancel(ctx: ToolContext, session: ToolSession): void {
		if (!session.selectionDrag) {
			return;
		}
		session.active = false;
		session.selectionDrag = null;
		ctx.selection.setPreview(null);
	}

	cursor(overImage: boolean): CursorValue {
		return overImage ? "crosshair" : "default";
	}
}
