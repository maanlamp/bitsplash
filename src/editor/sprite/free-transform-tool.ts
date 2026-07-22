import type { CursorValue } from "../../engine/cursor/cursor-authority";
import { hitTestHandle } from "./free-transform-handles";
import type {
	SpriteTool,
	ToolContext,
	ToolSession,
} from "./tool-strategy";

/** How close (in cells) a pointer must be to grab a point handle. */
const HANDLE_RADIUS = 1.5;

/**
 * The free-transform tool: an interactive scale / rotate / skew gizmo on the
 * floating selection about a movable pivot. Selecting it (or pressing the
 * transform shortcut) begins a transform on the current selection; a primary
 * drag then manipulates whichever handle it grabs:
 *
 * - **corner** — uniform scale about the pivot;
 * - **edge** — scale along that axis, or (with Alt held) skew that edge;
 * - **rotate knob** — rotate about the pivot;
 * - **pivot dot** — move the pivot;
 * - **body** — translate the whole float.
 *
 * The drag math derives the new parameters from the pointer's displacement
 * relative to the press, so no per-move state accumulates. Enter confirms the
 * bake (via the selection controller), Escape cancels back to the untransformed
 * float. Hit-testing works in integer cell space at a fixed radius — a
 * deliberately basic first cut; the handle feel and sub-cell precision are
 * flagged for interactive tuning.
 */
export class FreeTransformTool implements SpriteTool {
	readonly id = "transform" as const;

	onDown(ctx: ToolContext, session: ToolSession): void {
		if (ctx.button !== 0) {
			return;
		}
		if (
			!ctx.selection.transforming &&
			!ctx.selection.beginTransform()
		) {
			return;
		}
		const sess = ctx.selection.transformSession;
		if (!sess) {
			return;
		}
		const handle = hitTestHandle(
			sess.source,
			sess.params,
			sess.pivot,
			{ x: ctx.x + 0.5, y: ctx.y + 0.5 },
			HANDLE_RADIUS,
		);
		if (!handle) {
			return;
		}
		session.active = true;
		session.transformDrag = {
			handle,
			startX: ctx.x,
			startY: ctx.y,
			startParams: sess.params,
			startPivot: { ...sess.pivot },
		};
		ctx.capture();
	}

	onMove(ctx: ToolContext, session: ToolSession): void {
		const drag = session.transformDrag;
		if (!drag) {
			return;
		}
		const sel = ctx.selection;
		const start = drag.startParams;
		const pivot = drag.startPivot;
		const px = ctx.x + 0.5;
		const py = ctx.y + 0.5;
		const sx = drag.startX + 0.5;
		const sy = drag.startY + 0.5;

		switch (drag.handle) {
			case "move":
				sel.updateTransform({
					translateX: start.translateX + (ctx.x - drag.startX),
					translateY: start.translateY + (ctx.y - drag.startY),
				});
				return;
			case "pivot":
				sel.setTransformPivot(px, py);
				return;
			case "rotate": {
				const a0 = Math.atan2(sy - pivot.y, sx - pivot.x);
				const a1 = Math.atan2(py - pivot.y, px - pivot.x);
				sel.updateTransform({ rotate: start.rotate + (a1 - a0) });
				return;
			}
			case "nw":
			case "ne":
			case "se":
			case "sw": {
				const d0 = Math.hypot(sx - pivot.x, sy - pivot.y);
				const d1 = Math.hypot(px - pivot.x, py - pivot.y);
				if (d0 < 1e-3) {
					return;
				}
				const f = d1 / d0;
				sel.updateTransform({
					scaleX: start.scaleX * f,
					scaleY: start.scaleY * f,
				});
				return;
			}
			default: {
				const horizontal = drag.handle === "e" || drag.handle === "w";
				if (ctx.altKey) {
					this.skewEdge(ctx, drag, horizontal, px, py, sx, sy);
					return;
				}
				const axisStart = horizontal
					? Math.abs(sx - pivot.x)
					: Math.abs(sy - pivot.y);
				const axisNow = horizontal
					? Math.abs(px - pivot.x)
					: Math.abs(py - pivot.y);
				if (axisStart < 1e-3) {
					return;
				}
				const f = axisNow / axisStart;
				sel.updateTransform(
					horizontal
						? { scaleX: start.scaleX * f }
						: { scaleY: start.scaleY * f },
				);
			}
		}
	}

	onUp(_ctx: ToolContext, session: ToolSession): void {
		session.active = false;
		session.transformDrag = null;
	}

	onCancel(ctx: ToolContext, session: ToolSession): void {
		session.active = false;
		session.transformDrag = null;
		ctx.selection.cancelTransform();
	}

	cursor(overImage: boolean): CursorValue {
		return overImage ? "crosshair" : "default";
	}

	private skewEdge(
		ctx: ToolContext,
		drag: NonNullable<ToolSession["transformDrag"]>,
		horizontalEdge: boolean,
		px: number,
		py: number,
		sx: number,
		sy: number,
	): void {
		const source = ctx.selection.transformSession?.source;
		if (!source) {
			return;
		}
		const start = drag.startParams;
		if (drag.handle === "n" || drag.handle === "s") {
			const half = Math.max(1, (source.height / 2) * start.scaleY);
			ctx.selection.updateTransform({
				skewX: start.skewX + Math.atan2(px - sx, half),
			});
			return;
		}
		void horizontalEdge;
		const half = Math.max(1, (source.width / 2) * start.scaleX);
		ctx.selection.updateTransform({
			skewY: start.skewY + Math.atan2(py - sy, half),
		});
	}
}
