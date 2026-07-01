import { TransformComponent } from "../../engine/transform-component";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { pickActiveCamera2D } from "../../engine/camera/camera-2d-render";
import { cssVar } from "../css-var";
import type { DebugFlags, DebugOverlay } from "../debug-flags";

const AXIS_PIXELS = 14;
const HEAD_RATIO = 0.32;

export class TransformGizmoDebugSystem implements RenderSystem {
	private flags: DebugFlags;
	private overlay: DebugOverlay;
	private layer: number;

	constructor(
		flags: DebugFlags,
		overlay: DebugOverlay,
		layer: number,
	) {
		this.flags = flags;
		this.overlay = overlay;
		this.layer = layer;
	}

	private arrow(
		renderer: RenderContext["renderer"],
		cx: number,
		cy: number,
		tipX: number,
		tipY: number,
		color: string,
		width: number,
		head: number,
	): void {
		const dx = Math.sign(tipX - cx);
		const dy = Math.sign(tipY - cy);
		renderer.drawLine(this.layer, cx, cy, tipX, tipY, color, width);
		if (dx !== 0) {
			renderer.drawLine(
				this.layer,
				tipX,
				tipY,
				tipX - dx * head,
				tipY - head,
				color,
				width,
			);
			renderer.drawLine(
				this.layer,
				tipX,
				tipY,
				tipX - dx * head,
				tipY + head,
				color,
				width,
			);
		} else {
			renderer.drawLine(
				this.layer,
				tipX,
				tipY,
				tipX - head,
				tipY - dy * head,
				color,
				width,
			);
			renderer.drawLine(
				this.layer,
				tipX,
				tipY,
				tipX + head,
				tipY - dy * head,
				color,
				width,
			);
		}
	}

	render({ renderer, ecs }: RenderContext): void {
		if (!this.flags.get(this.overlay.id)) {
			return;
		}
		const zoom = pickActiveCamera2D(ecs)?.zoom ?? 1;
		const length = AXIS_PIXELS / zoom;
		const head = length * HEAD_RATIO;
		const width = 2 / zoom;
		const xColor = cssVar("--debug-axis-x");
		const yColor = cssVar("--debug-axis-y");
		for (const [, transform] of ecs.query(TransformComponent)) {
			const cx = transform.position.x;
			const cy = transform.position.y;
			this.arrow(
				renderer,
				cx,
				cy,
				cx + length,
				cy,
				xColor,
				width,
				head,
			);
			this.arrow(
				renderer,
				cx,
				cy,
				cx,
				cy - length,
				yColor,
				width,
				head,
			);
		}
	}
}
