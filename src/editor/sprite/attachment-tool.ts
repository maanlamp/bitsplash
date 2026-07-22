import type { CursorValue } from "../../engine/cursor/cursor-authority";
import type { BspritePoint } from "../../engine/sprite/bsprite-manifest";
import {
	clearAttachmentPoint,
	setAttachmentPoint,
} from "./attachment-commands";
import type {
	SpriteTool,
	ToolContext,
	ToolSession,
} from "./tool-strategy";

/**
 * Places and moves the **active** attachment point on the **current frame**.
 *
 * The active point name comes from the attachments panel via
 * {@link import("./sprite-editor-state").SpriteEditorState.activeAttachment}; the
 * tool is inert when none is selected. A primary press places (or grabs) the
 * point and a drag moves it, poking the document live for immediate feedback; the
 * release records **one** undoable command for the whole gesture (the pre-drag
 * value is restored first so the command captures the correct inverse). A
 * secondary (right) press clears the point on the current frame as its own
 * undoable edit.
 *
 * The drag is owned by the {@link import("./gesture-controller").GestureController}
 * like a stroke — it sets `session.active` so the controller keeps dispatching
 * moves/up even though no document stroke buffer is open — so a tool switch or
 * capture loss mid-drag cancels cleanly and never strands state.
 */
export class AttachmentTool implements SpriteTool {
	readonly id = "attachment" as const;

	private cell(ctx: ToolContext): BspritePoint {
		return {
			x: Math.max(0, Math.min(ctx.doc.width, ctx.x + 0.5)),
			y: Math.max(0, Math.min(ctx.doc.height, ctx.y + 0.5)),
		};
	}

	onDown(ctx: ToolContext, session: ToolSession): void {
		const name = ctx.state.activeAttachment;
		if (name === null || !ctx.overImage) {
			return;
		}
		const frame = ctx.doc.activeFrameIndex;
		if (ctx.button === 2) {
			clearAttachmentPoint(ctx.doc, ctx.history, name, frame);
			return;
		}
		if (ctx.button !== 0) {
			return;
		}
		session.attachment = {
			name,
			before: ctx.doc.attachmentPoint(name, frame),
		};
		session.active = true;
		ctx.capture();
		ctx.doc.setAttachmentPoint(name, frame, this.cell(ctx));
	}

	onMove(ctx: ToolContext, session: ToolSession): void {
		const drag = session.attachment;
		if (!drag) {
			return;
		}
		ctx.doc.setAttachmentPoint(
			drag.name,
			ctx.doc.activeFrameIndex,
			this.cell(ctx),
		);
	}

	onUp(ctx: ToolContext, session: ToolSession): void {
		const drag = session.attachment;
		if (!drag) {
			return;
		}
		session.attachment = null;
		session.active = false;
		const frame = ctx.doc.activeFrameIndex;
		const final = ctx.doc.attachmentPoint(drag.name, frame);
		// Restore the pre-drag state so the recorded command captures the correct
		// inverse; the command's `redo` re-applies the final point.
		if (drag.before) {
			ctx.doc.setAttachmentPoint(drag.name, frame, drag.before);
		} else {
			ctx.doc.clearAttachmentPoint(drag.name, frame);
		}
		if (final) {
			setAttachmentPoint(
				ctx.doc,
				ctx.history,
				drag.name,
				frame,
				final,
			);
		}
	}

	onCancel(ctx: ToolContext, session: ToolSession): void {
		const drag = session.attachment;
		if (!drag) {
			return;
		}
		session.attachment = null;
		session.active = false;
		const frame = ctx.doc.activeFrameIndex;
		if (drag.before) {
			ctx.doc.setAttachmentPoint(drag.name, frame, drag.before);
		} else {
			ctx.doc.clearAttachmentPoint(drag.name, frame);
		}
	}

	cursor(): CursorValue {
		return "crosshair";
	}
}
