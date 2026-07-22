import { bresenham } from "../line";
import { effectiveOpacityScale } from "./brush-dynamics";
import { PixelPerfectFilter } from "./pixel-perfect";
import { type CellFilter, stampDab } from "./stamp";
import { recordStroke } from "./stroke";
import type { StrokeMode } from "./stroke-buffer";
import { StrokeStabilizer } from "./stroke-stabilizer";
import type {
	SpriteTool,
	ToolContext,
	ToolPreview,
	ToolSession,
} from "./tool-strategy";
import type { CursorValue } from "../../engine/cursor/cursor-authority";
import type { SpriteToolId } from "./sprite-tool-id";

/**
 * Shared freehand-stroke behaviour for pixel tools (brush, eraser, dither).
 *
 * On press it snapshots the active layer, opens a document stroke buffer,
 * captures the pointer, folds pressure→opacity into the stroke, and stamps the
 * first dab into the buffer; on move it Bresenham-interpolates between the
 * previous and current cell so fast drags leave no gaps; on release it commits
 * the buffer into the layer once (opacity applied a single time — self-overlaps
 * never compound) and records one undo step. Subclasses supply the {@link mode}
 * (paint vs. erase) and may add a per-cell {@link cellFilter} (the dither brush);
 * every cell is stamped as a sized/shaped dab and written through the
 * ink+symmetry sink, so brush size, shape, ink and mirroring compose without
 * either tool knowing about them.
 *
 * The incoming cell stream is smoothed by a {@link StrokeStabilizer} when the
 * stabilizer modifier is non-zero, then thinned by a {@link PixelPerfectFilter}
 * when pixel-perfect is on — stabilization first, pixel-perfect second — before
 * any dab is stamped.
 */
export abstract class StrokeTool implements SpriteTool {
	abstract readonly id: SpriteToolId;

	/** Whether this tool paints coverage or erases it. */
	protected abstract readonly mode: StrokeMode;

	/**
	 * A per-cell filter for this stroke, rebuilt from live editor state at the
	 * start of each hook. Defaults to `null` (every cell painted); the dither
	 * brush overrides it with an ordered-dither mask.
	 */
	protected cellFilter(_ctx: ToolContext): CellFilter {
		return null;
	}

	private stamp(
		ctx: ToolContext,
		x: number,
		y: number,
		filter: CellFilter,
	): void {
		stampDab(ctx, x, y, this.mode, filter);
	}

	/** Route one smoothed cell through the pixel-perfect filter (or directly). */
	private emit(
		ctx: ToolContext,
		session: ToolSession,
		x: number,
		y: number,
		filter: CellFilter,
	): void {
		if (session.pp) {
			for (const [ex, ey] of session.pp.push(x, y)) {
				this.stamp(ctx, ex, ey, filter);
			}
		} else {
			this.stamp(ctx, x, y, filter);
		}
	}

	onDown(ctx: ToolContext, session: ToolSession): void {
		if (ctx.button !== 0 || !ctx.overImage) {
			return;
		}
		session.snapshot = ctx.doc.snapshot();
		ctx.doc.beginStroke();
		ctx.doc.setStrokeOpacityScale(
			effectiveOpacityScale(ctx.state, ctx.pressure),
		);
		ctx.capture();
		if (ctx.state.modifiers.pixelPerfect) {
			session.pp = new PixelPerfectFilter();
		}
		if (ctx.state.modifiers.stabilizer > 0) {
			session.stab = new StrokeStabilizer(
				ctx.state.modifiers.stabilizer,
			);
		}
		const filter = this.cellFilter(ctx);
		const [sx, sy] = session.stab
			? session.stab.begin(ctx.x, ctx.y)
			: [ctx.x, ctx.y];
		this.emit(ctx, session, sx, sy, filter);
		session.last = { x: sx, y: sy };
		ctx.doc.refreshStrokePreview();
	}

	onMove(ctx: ToolContext, session: ToolSession): void {
		const from = session.last;
		if (!from) {
			return;
		}
		const [tx, ty] = session.stab
			? session.stab.push(ctx.x, ctx.y)
			: [ctx.x, ctx.y];
		if (from.x === tx && from.y === ty) {
			return;
		}
		const filter = this.cellFilter(ctx);
		bresenham(from.x, from.y, tx, ty, (x, y) => {
			this.emit(ctx, session, x, y, filter);
		});
		session.last = { x: tx, y: ty };
		ctx.doc.refreshStrokePreview();
	}

	onUp(ctx: ToolContext, session: ToolSession): void {
		if (!session.snapshot) {
			return;
		}
		const filter = this.cellFilter(ctx);
		if (session.stab && session.last) {
			let prev = session.last;
			for (const [tx, ty] of session.stab.flush(ctx.x, ctx.y)) {
				bresenham(prev.x, prev.y, tx, ty, (x, y) => {
					this.emit(ctx, session, x, y, filter);
				});
				prev = { x: tx, y: ty };
			}
			session.stab = null;
		}
		if (session.pp) {
			for (const [x, y] of session.pp.flush()) {
				this.stamp(ctx, x, y, filter);
			}
			session.pp = null;
		}
		ctx.doc.commitStroke();
		recordStroke(ctx.doc, ctx.history, session.snapshot);
		session.snapshot = null;
		session.last = null;
	}

	onCancel(ctx: ToolContext, session: ToolSession): void {
		if (!session.snapshot) {
			return;
		}
		ctx.doc.cancelStroke();
		session.snapshot = null;
		session.last = null;
		session.pp = null;
		session.stab = null;
	}

	preview(): ToolPreview {
		return { brushCell: true };
	}

	cursor(overImage: boolean): CursorValue {
		return overImage ? "none" : "default";
	}
}
