import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { dabOffsets } from "./brush-dab";
import type { SpriteEditorState } from "./sprite-editor-state";

export type HoverState = {
	x: number;
	y: number;
	active: boolean;
};

/**
 * Draws the brush cursor over the hovered pixel cell: a filled preview of the
 * paint color, wrapped in a black-outer / white-inner contrast outline.
 *
 * The double outline is the pragmatic equivalent of Aseprite's "negative black
 * & white" cursor — because at least one of the two bands contrasts against any
 * single background color, the cursor stays visible even when hovering a pixel
 * already painted the brush color (the same-color-invisibility case). Each band
 * is one screen pixel wide, derived from the camera zoom so it holds a constant
 * on-screen thickness regardless of zoom level.
 *
 * When `footprint` is set (the direct texture view), the cursor shows the whole
 * sized/shaped dab the brush would stamp, not just the single centre cell; the
 * tileset paint-through view leaves it off since a cell there is a tile, not a
 * source pixel.
 */
export class SpriteHoverSystem implements RenderSystem {
	constructor(
		private layer: number,
		private hover: HoverState,
		private state: SpriteEditorState,
		private footprint = true,
	) {}

	render({ renderer, camera }: RenderContext): void {
		if (!this.hover.active) {
			return;
		}
		const px = 1 / (camera?.zoom ?? 1);
		const offsets = this.footprint
			? dabOffsets(this.state.brushShape, this.state.brushSize)
			: [[0, 0] as const];
		for (const [dx, dy] of offsets) {
			renderer.drawRect(this.layer, {
				x: this.hover.x + dx,
				y: this.hover.y + dy,
				width: 1,
				height: 1,
				fill: this.state.css,
			});
		}
		for (const [dx, dy] of offsets) {
			const x = this.hover.x + dx;
			const y = this.hover.y + dy;
			renderer.drawRect(this.layer, {
				x,
				y,
				width: 1,
				height: 1,
				stroke: "#000",
				lineWidth: px,
			});
			renderer.drawRect(this.layer, {
				x: x + px,
				y: y + px,
				width: 1 - px * 2,
				height: 1 - px * 2,
				stroke: "#fff",
				lineWidth: px,
			});
		}
	}
}
