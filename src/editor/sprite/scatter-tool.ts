import { bresenham } from "../line";
import { dabOffsets } from "./brush-dab";
import { type Rng, jitterSize, scatterOffsets } from "./scatter";
import { recordStroke } from "./stroke";
import type {
	SpriteTool,
	ToolContext,
	ToolPreview,
	ToolSession,
} from "./tool-strategy";
import type { CursorValue } from "../../engine/cursor/cursor-authority";

/**
 * Scatter brush: as you drag, it sprays randomly-offset dabs within a radius for
 * organic, textured strokes (foliage, stippling, spray). Each burst places
 * `scatterDensity` dabs at area-uniform random offsets within `scatterRadius`,
 * each dab a size jittered down from the base brush size by `scatterSizeJitter`.
 * Painting goes through the ink+symmetry sink; the whole drag commits once as a
 * single undo entry.
 *
 * Bursts are placed along the drag at roughly one radius spacing so a fast drag
 * still lays a continuous band without stamping every interpolated pixel. The
 * randomness (`Math.random`) is intentional and fine here — a creative editor
 * tool, not serialized deterministic state; the pure offset/jitter maths live in
 * `scatter.ts` and are unit tested with a seeded generator.
 *
 * The bundled behaviour doubles as the "foliage" starting point (clustered small
 * dabs); a dedicated foliage preset with clustering is flagged as a follow-up.
 */
export class ScatterTool implements SpriteTool {
	readonly id = "scatter" as const;

	private rng: Rng = Math.random;

	private spray(ctx: ToolContext, cx: number, cy: number): void {
		const density = Math.max(1, Math.round(ctx.state.scatterDensity));
		const radius = Math.max(0, ctx.state.scatterRadius);
		const jitter = ctx.state.scatterSizeJitter;
		for (const [ox, oy] of scatterOffsets(
			this.rng,
			density,
			radius,
		)) {
			const size = jitterSize(this.rng, ctx.state.brushSize, jitter);
			for (const [dx, dy] of dabOffsets(ctx.state.brushShape, size)) {
				ctx.paint(cx + ox + dx, cy + oy + dy);
			}
		}
	}

	onDown(ctx: ToolContext, session: ToolSession): void {
		if (ctx.button !== 0 || !ctx.overImage) {
			return;
		}
		session.snapshot = ctx.doc.core.snapshot();
		ctx.doc.beginStroke();
		ctx.capture();
		this.spray(ctx, ctx.x, ctx.y);
		session.last = { x: ctx.x, y: ctx.y };
		ctx.doc.refreshStrokePreview();
	}

	onMove(ctx: ToolContext, session: ToolSession): void {
		const from = session.last;
		if (!from) {
			return;
		}
		const step = Math.max(1, Math.round(ctx.state.scatterRadius));
		let n = 0;
		bresenham(from.x, from.y, ctx.x, ctx.y, (x, y) => {
			if (n > 0 && n % step === 0) {
				this.spray(ctx, x, y);
			}
			n++;
		});
		this.spray(ctx, ctx.x, ctx.y);
		session.last = { x: ctx.x, y: ctx.y };
		ctx.doc.refreshStrokePreview();
	}

	onUp(ctx: ToolContext, session: ToolSession): void {
		if (!session.snapshot) {
			return;
		}
		ctx.doc.commitStroke();
		recordStroke(ctx.doc.core, ctx.history, session.snapshot);
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
	}

	preview(): ToolPreview {
		return { brushCell: true };
	}

	cursor(overImage: boolean): CursorValue {
		return overImage ? "none" : "default";
	}
}
