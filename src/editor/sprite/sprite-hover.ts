import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import type { SpriteEditorState } from "./sprite-editor-state";

export type HoverState = {
	x: number;
	y: number;
	active: boolean;
};

export class SpriteHoverSystem implements RenderSystem {
	constructor(
		private layer: number,
		private hover: HoverState,
		private state: SpriteEditorState,
	) {}

	render({ renderer }: RenderContext): void {
		if (!this.hover.active) {
			return;
		}
		renderer.drawRect(this.layer, {
			x: this.hover.x,
			y: this.hover.y,
			width: 1,
			height: 1,
			fill: this.state.css,
		});
	}
}
