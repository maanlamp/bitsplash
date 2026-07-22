import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import type Renderer2D from "../../engine/render/renderer-2d";
import {
	type HandlePoint,
	transformHandlePoints,
} from "./free-transform-handles";
import type { PixelBuffer } from "./pixel-buffer";
import type {
	AntEdge,
	FreeTransformSession,
	SelectionController,
} from "./selection-controller";

/** Ants advance this many dash cells per second. */
const ANT_SPEED = 8;

/**
 * Draws the selection overlay above the sprite: the floating selection's lifted
 * pixels at their live drag offset, the in-progress rubber band (rect/lasso),
 * and the marching-ants boundary of the committed marquee or float.
 *
 * The ants are an animated black-on-white dashed outline: every boundary edge is
 * one screen pixel wide (derived from the camera zoom, so the line is
 * zoom-independent) and each edge alternates black/white on a phase that
 * advances with time, reading as a boundary crawling around the selection. The
 * overlay is immediate-mode — it redraws from the controller's cached boundary
 * edges every frame — so the animation runs off the preview game's render loop
 * with no per-frame allocation beyond the draw calls.
 */
export class SelectionRenderSystem extends RenderSystem {
	private cachedLifted: PixelBuffer | null = null;
	private cachedCanvas: HTMLCanvasElement | null = null;

	constructor(
		private layer: number,
		private controller: SelectionController,
		private width: number,
		private height: number,
	) {
		super();
	}

	render({ renderer, camera, time }: RenderContext): void {
		const px = 1 / (camera?.zoom ?? 1);
		const state = this.controller.state;

		if (state.kind === "floating") {
			renderer.drawImage(
				this.layer,
				this.liftedCanvas(state.lifted),
				{
					x: this.width / 2 + state.offset.x,
					y: this.height / 2 + state.offset.y,
					width: this.width,
					height: this.height,
				},
			);
			this.drawAnts(
				renderer,
				this.controller.edges,
				state.offset.x,
				state.offset.y,
				px,
				time.elapsed,
			);
			if (state.transform) {
				this.drawTransformGizmo(renderer, state.transform, px);
			}
		} else if (state.kind === "marquee") {
			this.drawAnts(
				renderer,
				this.controller.edges,
				0,
				0,
				px,
				time.elapsed,
			);
		}

		this.drawPreview(renderer, px);
	}

	/**
	 * The floated pixels rasterised to a canvas for {@link Renderer2D.drawImage},
	 * rebuilt only when the underlying buffer changes (a lift or paste) — a drag
	 * only moves the offset, so the same canvas is reused across the drag.
	 */
	private liftedCanvas(lifted: PixelBuffer): HTMLCanvasElement {
		if (this.cachedLifted === lifted && this.cachedCanvas) {
			return this.cachedCanvas;
		}
		const canvas = document.createElement("canvas");
		canvas.width = lifted.width;
		canvas.height = lifted.height;
		const ctx = canvas.getContext("2d")!;
		const image = ctx.createImageData(lifted.width, lifted.height);
		image.data.set(lifted.data);
		ctx.putImageData(image, 0, 0);
		this.cachedLifted = lifted;
		this.cachedCanvas = canvas;
		return canvas;
	}

	private drawAnts(
		renderer: Renderer2D,
		edges: ReadonlyArray<AntEdge>,
		dx: number,
		dy: number,
		px: number,
		elapsed: number,
	): void {
		const phase = Math.floor(elapsed * ANT_SPEED);
		for (const [x0, y0, x1, y1] of edges) {
			renderer.drawLine(
				this.layer,
				x0 + dx,
				y0 + dy,
				x1 + dx,
				y1 + dy,
				"#fff",
				px,
			);
		}
		for (const [x0, y0, x1, y1] of edges) {
			if ((x0 + y0 + phase) % 2 !== 0) {
				continue;
			}
			renderer.drawLine(
				this.layer,
				x0 + dx,
				y0 + dy,
				x1 + dx,
				y1 + dy,
				"#000",
				px,
			);
		}
	}

	/**
	 * The free-transform gizmo over the transformed float: the transformed box (a
	 * parallelogram once rotate/skew are non-zero), square scale handles at the
	 * corners and edge midpoints, a rotate knob past the top edge, and a distinct
	 * pivot marker. Handle sizes are in screen pixels (scaled by `px = 1/zoom`) so
	 * they stay grabbable at any zoom.
	 */
	private drawTransformGizmo(
		renderer: Renderer2D,
		session: FreeTransformSession,
		px: number,
	): void {
		const h = transformHandlePoints(
			session.source,
			session.params,
			session.pivot,
		);
		const box: HandlePoint[] = [h.nw, h.ne, h.se, h.sw];
		for (let i = 0; i < 4; i++) {
			const a = box[i]!;
			const b = box[(i + 1) % 4]!;
			renderer.drawLine(this.layer, a.x, a.y, b.x, b.y, "#39f", px);
		}
		// Line from the top edge to the rotate knob.
		renderer.drawLine(
			this.layer,
			h.n.x,
			h.n.y,
			h.rotate.x,
			h.rotate.y,
			"#39f",
			px,
		);
		const side = 6 * px;
		for (const p of [h.nw, h.ne, h.se, h.sw, h.n, h.e, h.s, h.w]) {
			this.drawHandle(renderer, p, side, "#fff", "#39f", px);
		}
		this.drawHandle(renderer, h.rotate, side, "#39f", "#fff", px);
		// Pivot: a hollow diamond in a contrasting colour.
		const pd = 5 * px;
		renderer.drawRect(this.layer, {
			x: h.pivot.x - pd,
			y: h.pivot.y - pd,
			width: pd * 2,
			height: pd * 2,
			rotation: Math.PI / 4,
			stroke: "#fb0",
			lineWidth: px,
		});
	}

	private drawHandle(
		renderer: Renderer2D,
		p: HandlePoint,
		side: number,
		fill: string,
		stroke: string,
		px: number,
	): void {
		renderer.drawRect(this.layer, {
			x: p.x - side / 2,
			y: p.y - side / 2,
			width: side,
			height: side,
			fill,
			stroke,
			lineWidth: px,
		});
	}

	private drawPreview(renderer: Renderer2D, px: number): void {
		const preview = this.controller.preview;
		if (!preview) {
			return;
		}
		if (preview.kind === "rect") {
			const x = Math.min(preview.ax, preview.bx);
			const y = Math.min(preview.ay, preview.by);
			const w = Math.abs(preview.bx - preview.ax) + 1;
			const h = Math.abs(preview.by - preview.ay) + 1;
			renderer.drawRect(this.layer, {
				x,
				y,
				width: w,
				height: h,
				stroke: "#fff",
				lineWidth: px,
			});
			return;
		}
		const pts = preview.points;
		for (let i = 0; i < pts.length - 1; i++) {
			const [ax, ay] = pts[i]!;
			const [bx, by] = pts[i + 1]!;
			renderer.drawLine(
				this.layer,
				ax + 0.5,
				ay + 0.5,
				bx + 0.5,
				by + 0.5,
				"#fff",
				px,
			);
		}
	}
}
