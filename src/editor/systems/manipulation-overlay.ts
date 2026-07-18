import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import type { EntityEditorSystem } from "./entity-editor";

const GUIDE_STROKE = "rgba(255, 90, 200, 0.9)";
const MARQUEE_STROKE = "rgba(80, 180, 255, 0.9)";
const MARQUEE_FILL = "rgba(80, 180, 255, 0.12)";

/**
 * Draws the live manipulation overlays for the scene view (plan E2/E3): the
 * smart-guide alignment lines while dragging and the intersect-marquee
 * rectangle while box-selecting. Reads its state from the
 * {@link EntityEditorSystem} each frame (update runs before render), so it owns
 * no interaction state of its own.
 */
export class ManipulationOverlaySystem implements RenderSystem {
	constructor(
		private readonly editor: EntityEditorSystem,
		private readonly layer: number,
	) {}

	render({ renderer, camera }: RenderContext): void {
		const zoom = camera?.zoom ?? 1;
		const lineWidth = 1 / zoom;

		for (const guide of this.editor.guides) {
			if (guide.axis === "x") {
				renderer.drawLine(
					this.layer,
					guide.position,
					guide.start,
					guide.position,
					guide.end,
					GUIDE_STROKE,
					lineWidth,
				);
			} else {
				renderer.drawLine(
					this.layer,
					guide.start,
					guide.position,
					guide.end,
					guide.position,
					GUIDE_STROKE,
					lineWidth,
				);
			}
		}

		const marquee = this.editor.marquee;
		if (marquee) {
			renderer.drawRect(this.layer, {
				x: marquee.minX,
				y: marquee.minY,
				width: marquee.maxX - marquee.minX,
				height: marquee.maxY - marquee.minY,
				fill: MARQUEE_FILL,
				stroke: MARQUEE_STROKE,
				lineWidth,
			});
		}
	}
}
