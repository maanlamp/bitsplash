import type Renderer2D from "../../engine/render/renderer-2d";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import type { SpriteDocument } from "./sprite-document";
import type { SpriteEditorState } from "./sprite-editor-state";

const ACCENT = "#ffb020";

/**
 * Draws the draggable handle for the **active** attachment point on the **current
 * frame**, but only while the attachment tool is active. The handle is a
 * crosshair plus a centre dot, each band sized from the camera zoom so it holds a
 * constant on-screen size at any zoom — the same contrast trick as
 * {@link import("./sprite-hover").SpriteHoverSystem}: a black halo under an
 * accent-coloured mark keeps it visible over any pixels.
 *
 * The point is authored in unmirrored canvas-pixel space, so it renders directly
 * at its stored `(x, y)` with no flip handling (flip is a game-render concern).
 */
export class SpriteAttachmentRenderSystem implements RenderSystem {
	constructor(
		private layer: number,
		private doc: SpriteDocument,
		private state: SpriteEditorState,
	) {}

	render({ renderer, camera }: RenderContext): void {
		if (this.state.tool !== "attachment") {
			return;
		}
		const name = this.state.activeAttachment;
		if (name === null) {
			return;
		}
		const point = this.doc.core.attachmentPoint(
			name,
			this.doc.core.activeFrameIndex,
		);
		if (!point) {
			return;
		}
		const px = 1 / (camera?.zoom ?? 1);
		const arm = 5 * px;
		this.crosshair(renderer, point.x, point.y, arm, "#000", 3 * px);
		this.crosshair(renderer, point.x, point.y, arm, ACCENT, px);
		const dot = 2 * px;
		renderer.drawRect(this.layer, {
			x: point.x - dot / 2,
			y: point.y - dot / 2,
			width: dot,
			height: dot,
			fill: ACCENT,
			stroke: "#000",
			lineWidth: px,
		});
	}

	private crosshair(
		renderer: Renderer2D,
		cx: number,
		cy: number,
		arm: number,
		color: string,
		width: number,
	): void {
		renderer.drawLine(
			this.layer,
			cx - arm,
			cy,
			cx + arm,
			cy,
			color,
			width,
		);
		renderer.drawLine(
			this.layer,
			cx,
			cy - arm,
			cx,
			cy + arm,
			color,
			width,
		);
	}
}
