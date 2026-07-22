import { gradientDither } from "./gradient";
import { recordStroke } from "./stroke";
import type {
	SpriteTool,
	ToolContext,
	ToolSession,
} from "./tool-strategy";
import type { CursorValue } from "../../engine/cursor/cursor-authority";

/**
 * Dithered gradient tool: press-drag-release defines the gradient axis, and an
 * ordered-dither gradient is rasterised into the stroke buffer live on every
 * move, committed once on release as a single undo entry.
 *
 * The gradient runs from the active colour at the press point to **transparent**
 * at the release point (only the start-colour cells are painted; the rest are
 * left transparent). A true two-colour gradient wants a secondary editor colour,
 * which does not exist yet — see the plan's flagged follow-up. Painting goes
 * through the ink+symmetry sink like every other tool.
 */
export class GradientTool implements SpriteTool {
	readonly id = "gradient" as const;

	private render(ctx: ToolContext, session: ToolSession): void {
		const origin = session.shape;
		if (!origin) {
			return;
		}
		ctx.doc.clearStroke();
		const { a } = gradientDither(
			ctx.doc.width,
			ctx.doc.height,
			origin.x0,
			origin.y0,
			ctx.x,
			ctx.y,
		);
		for (const [x, y] of a) {
			ctx.paint(x, y);
		}
		ctx.doc.refreshStrokePreview();
	}

	onDown(ctx: ToolContext, session: ToolSession): void {
		if (ctx.button !== 0 || !ctx.overImage) {
			return;
		}
		session.snapshot = ctx.doc.snapshot();
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
		recordStroke(ctx.doc, ctx.history, session.snapshot);
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

	cursor(overImage: boolean): CursorValue {
		return overImage ? "crosshair" : "default";
	}
}
