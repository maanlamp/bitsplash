import { stampDab } from "./stamp";
import { recordStroke } from "./stroke";
import type { Cell } from "./shapes";
import type {
	SpriteTool,
	ToolContext,
	ToolPreview,
	ToolSession,
} from "./tool-strategy";
import type { CursorValue } from "../../engine/cursor/cursor-authority";
import type { SpriteToolId } from "./sprite-tool-id";

/**
 * Shared press-drag-release rubber-band behaviour for the shape tools (line,
 * rectangle, ellipse).
 *
 * On press it snapshots the active cel, opens a document stroke buffer and
 * captures the pointer; on every move it clears the buffer and re-rasterises the
 * shape from the press origin to the current cell, so the preview tracks the
 * drag live at one recomposite per event; on release it commits the buffer once
 * (one undo entry) and records the stroke. Each shape cell is stamped as a
 * sized/shaped dab through the ink+symmetry sink, so brush thickness, ink and
 * mirroring compose for free. Subclasses supply only {@link cells} — the pure
 * rasteriser for their shape.
 */
export abstract class ShapeTool implements SpriteTool {
	abstract readonly id: SpriteToolId;

	/** Rasterise the shape spanned by origin `(x0,y0)` and current `(x1,y1)`. */
	protected abstract cells(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		fill: boolean,
	): ReadonlyArray<Cell>;

	/** Whether this shape supports a filled variant (`shapeFill` option). */
	protected fillable(): boolean {
		return false;
	}

	private render(ctx: ToolContext, session: ToolSession): void {
		const origin = session.shape;
		if (!origin) {
			return;
		}
		ctx.doc.clearStroke();
		const fill = this.fillable() && ctx.state.shapeFill;
		for (const [x, y] of this.cells(
			origin.x0,
			origin.y0,
			ctx.x,
			ctx.y,
			fill,
		)) {
			stampDab(ctx, x, y, "paint");
		}
		ctx.doc.refreshStrokePreview();
	}

	onDown(ctx: ToolContext, session: ToolSession): void {
		if (ctx.button !== 0 || !ctx.overImage) {
			return;
		}
		session.snapshot = ctx.doc.core.snapshot();
		session.shape = { x0: ctx.x, y0: ctx.y };
		ctx.doc.beginStroke();
		ctx.capture();
		this.render(ctx, session);
	}

	onMove(ctx: ToolContext, session: ToolSession): void {
		if (!session.shape) {
			return;
		}
		this.render(ctx, session);
	}

	onUp(ctx: ToolContext, session: ToolSession): void {
		if (!session.snapshot) {
			return;
		}
		ctx.doc.commitStroke();
		recordStroke(ctx.doc.core, ctx.history, session.snapshot);
		session.snapshot = null;
		session.shape = null;
	}

	onCancel(ctx: ToolContext, session: ToolSession): void {
		if (!session.snapshot) {
			return;
		}
		ctx.doc.cancelStroke();
		session.snapshot = null;
		session.shape = null;
	}

	preview(): ToolPreview {
		return { brushCell: true };
	}

	cursor(overImage: boolean): CursorValue {
		return overImage ? "none" : "default";
	}
}
