import type { CursorValue } from "../../engine/cursor/cursor-authority";
import { bresenham } from "../line";
import { runCommand } from "./command-router";
import { stampPatternOver } from "./custom-brush";
import { type PixelBuffer, blankPixels } from "./pixel-buffer";
import type {
	SpriteTool,
	ToolContext,
	ToolPreview,
	ToolSession,
} from "./tool-strategy";

const clone = (buffer: PixelBuffer): PixelBuffer => ({
	width: buffer.width,
	height: buffer.height,
	data: new Uint8ClampedArray(buffer.data),
});

/**
 * The custom-brush tool: stamps the editor's captured brush pattern
 * ({@link SpriteEditorState.customBrush}) along a freehand stroke, centred on
 * the cursor and Bresenham-interpolated between move samples. Each stamp is a
 * straight-alpha source-over of the pattern onto the active cel's working copy,
 * so the pattern's own colours and per-pixel alpha are preserved (unlike the
 * single-colour freehand brush). The whole drag commits as one undo entry.
 *
 * Inert until a pattern has been captured ("capture brush from selection"); a
 * press with no pattern does nothing. Symmetry and inks are intentionally not
 * applied to the stamp (flagged) — it lays down the captured pixels verbatim.
 */
export class CustomBrushTool implements SpriteTool {
	readonly id = "custom-brush" as const;

	onDown(ctx: ToolContext, session: ToolSession): void {
		const pattern = ctx.state.customBrush;
		if (ctx.button !== 0 || !ctx.overImage || !pattern) {
			return;
		}
		const layerId = ctx.doc.core.activeLayerId;
		const frameIndex = ctx.doc.core.activeFrameIndex;
		const cel = ctx.doc.core.getCel(layerId, frameIndex);
		const before = cel
			? clone(cel)
			: blankPixels(ctx.doc.width, ctx.doc.height);
		const working = stampPatternOver(before, pattern, ctx.x, ctx.y);
		ctx.doc.core.setCel(layerId, frameIndex, working);
		session.custom = { layerId, frameIndex, before, working };
		session.last = { x: ctx.x, y: ctx.y };
		session.active = true;
		ctx.capture();
	}

	onMove(ctx: ToolContext, session: ToolSession): void {
		const c = session.custom;
		const from = session.last;
		const pattern = ctx.state.customBrush;
		if (!c || !from || !pattern) {
			return;
		}
		let working = c.working;
		bresenham(from.x, from.y, ctx.x, ctx.y, (x, y) => {
			if (x === from.x && y === from.y) {
				return;
			}
			working = stampPatternOver(working, pattern, x, y);
		});
		c.working = working;
		ctx.doc.core.setCel(c.layerId, c.frameIndex, working);
		session.last = { x: ctx.x, y: ctx.y };
	}

	onUp(ctx: ToolContext, session: ToolSession): void {
		const c = session.custom;
		if (!c) {
			return;
		}
		const { layerId, frameIndex, before, working } = c;
		session.custom = null;
		session.last = null;
		session.active = false;
		runCommand(ctx.doc.core, ctx.history, {
			redo: () =>
				ctx.doc.core.setCel(layerId, frameIndex, clone(working)),
			undo: () =>
				ctx.doc.core.setCel(layerId, frameIndex, clone(before)),
		});
	}

	onCancel(ctx: ToolContext, session: ToolSession): void {
		const c = session.custom;
		if (!c) {
			return;
		}
		ctx.doc.core.setCel(c.layerId, c.frameIndex, clone(c.before));
		session.custom = null;
		session.last = null;
		session.active = false;
	}

	preview(): ToolPreview {
		return { brushCell: true };
	}

	cursor(overImage: boolean): CursorValue {
		return overImage ? "none" : "default";
	}
}
