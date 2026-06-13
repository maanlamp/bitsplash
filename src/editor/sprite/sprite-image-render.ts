import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import type { SpriteDocument } from "./sprite-document";

export class SpriteImageRenderSystem implements RenderSystem {
	constructor(
		private doc: SpriteDocument,
		private layer: number,
	) {}

	render({ renderer }: RenderContext): void {
		renderer.drawImage(this.layer, this.doc.canvas, {
			x: this.doc.width / 2,
			y: this.doc.height / 2,
			width: this.doc.width,
			height: this.doc.height,
		});
	}
}
