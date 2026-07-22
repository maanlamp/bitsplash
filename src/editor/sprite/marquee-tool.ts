import type { CursorValue } from "../../engine/cursor/cursor-authority";
import { rectMask, selectionOp } from "./selection-mask";
import type {
	SpriteTool,
	ToolContext,
	ToolSession,
} from "./tool-strategy";

/**
 * The rectangular marquee. A primary drag rubber-bands a rectangle and, on
 * release, builds a rectangular selection combined into the current one under
 * the modifier op (Shift adds, Alt subtracts, both intersect, neither replaces).
 *
 * Pressing inside an existing selection with no modifier instead **lifts** it
 * into a floating selection and drags it (a move); the float commits later via
 * the choke-point (tool/frame/layer switch, save, any command) or Enter, and
 * cancels via Escape. A plain click with no drag deselects.
 */
export class MarqueeTool implements SpriteTool {
	readonly id = "marquee" as const;

	onDown(ctx: ToolContext, session: ToolSession): void {
		if (ctx.button !== 0 || !ctx.overImage) {
			return;
		}
		const op = selectionOp(ctx.shiftKey, ctx.altKey);
		if (
			op === "replace" &&
			ctx.selection.pointInSelection(ctx.x, ctx.y)
		) {
			if (ctx.selection.beginMove()) {
				session.active = true;
				session.selectionDrag = {
					mode: "move",
					ax: ctx.x,
					ay: ctx.y,
					op,
					points: [],
				};
				ctx.capture();
			}
			return;
		}
		session.active = true;
		session.selectionDrag = {
			mode: "rect",
			ax: ctx.x,
			ay: ctx.y,
			op,
			points: [],
		};
		ctx.selection.setPreview({
			kind: "rect",
			ax: ctx.x,
			ay: ctx.y,
			bx: ctx.x,
			by: ctx.y,
		});
		ctx.capture();
	}

	onMove(ctx: ToolContext, session: ToolSession): void {
		const drag = session.selectionDrag;
		if (!drag) {
			return;
		}
		if (drag.mode === "move") {
			ctx.selection.dragTo(ctx.x - drag.ax, ctx.y - drag.ay);
			return;
		}
		ctx.selection.setPreview({
			kind: "rect",
			ax: drag.ax,
			ay: drag.ay,
			bx: ctx.x,
			by: ctx.y,
		});
	}

	onUp(ctx: ToolContext, session: ToolSession): void {
		const drag = session.selectionDrag;
		if (!drag) {
			return;
		}
		session.active = false;
		session.selectionDrag = null;
		if (drag.mode === "move") {
			return;
		}
		ctx.selection.setPreview(null);
		if (
			drag.op === "replace" &&
			drag.ax === ctx.x &&
			drag.ay === ctx.y
		) {
			ctx.selection.clear();
			return;
		}
		ctx.selection.applyRegion(
			rectMask(
				ctx.doc.width,
				ctx.doc.height,
				drag.ax,
				drag.ay,
				ctx.x,
				ctx.y,
			),
			drag.op,
		);
	}

	onCancel(ctx: ToolContext, session: ToolSession): void {
		const drag = session.selectionDrag;
		if (!drag) {
			return;
		}
		session.active = false;
		session.selectionDrag = null;
		ctx.selection.setPreview(null);
		if (drag.mode === "move") {
			ctx.selection.escape();
		}
	}

	cursor(overImage: boolean): CursorValue {
		return overImage ? "crosshair" : "default";
	}
}
