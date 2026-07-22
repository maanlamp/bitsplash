import type { CursorValue } from "../../engine/cursor/cursor-authority";
import type {
	SpriteTool,
	ToolContext,
	ToolSession,
} from "./tool-strategy";

/**
 * The move tool. A primary drag lifts the current marquee off the active cel
 * into a floating selection and moves it (or continues dragging one that is
 * already floating), leaving transparency behind. Releasing keeps the float
 * uncommitted so it can be nudged again; it commits via the choke-point
 * (tool/frame/layer switch, save, any command) or Enter, and cancels via
 * Escape. With nothing selected the tool is inert.
 */
export class MoveTool implements SpriteTool {
	readonly id = "move" as const;

	onDown(ctx: ToolContext, session: ToolSession): void {
		if (ctx.button !== 0) {
			return;
		}
		const state = ctx.selection.state;
		if (state.kind === "floating") {
			session.active = true;
			session.selectionDrag = {
				mode: "move",
				ax: ctx.x - state.offset.x,
				ay: ctx.y - state.offset.y,
				op: "replace",
				points: [],
			};
			ctx.capture();
			return;
		}
		if (state.kind === "marquee" && ctx.selection.beginMove()) {
			session.active = true;
			session.selectionDrag = {
				mode: "move",
				ax: ctx.x,
				ay: ctx.y,
				op: "replace",
				points: [],
			};
			ctx.capture();
		}
	}

	onMove(ctx: ToolContext, session: ToolSession): void {
		const drag = session.selectionDrag;
		if (!drag) {
			return;
		}
		ctx.selection.dragTo(ctx.x - drag.ax, ctx.y - drag.ay);
	}

	onUp(_ctx: ToolContext, session: ToolSession): void {
		session.active = false;
		session.selectionDrag = null;
	}

	onCancel(ctx: ToolContext, session: ToolSession): void {
		if (!session.selectionDrag) {
			return;
		}
		session.active = false;
		session.selectionDrag = null;
		ctx.selection.escape();
	}

	cursor(overImage: boolean): CursorValue {
		return overImage ? "move" : "default";
	}
}
