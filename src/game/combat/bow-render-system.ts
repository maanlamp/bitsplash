import { resolveRenderLayer } from "../../engine/render/render-layers";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import bowUrl from "../content/assets/bow.png";
import { BowComponent } from "../combat/bow-component";

export class BowRenderSystem implements RenderSystem {
	render({ renderer, ecs, assetManager }: RenderContext): void {
		const image = assetManager.getImage(bowUrl);
		if (!image) {
			return;
		}
		const layer = resolveRenderLayer(ecs, "entities", 0);
		for (const [, bow] of ecs.query(BowComponent)) {
			if (!bow.visible) {
				continue;
			}
			renderer.drawImage(layer, image, {
				x: bow.renderPosition.x,
				y: bow.renderPosition.y,
				width: image.width,
				height: image.height,
				rotation: bow.renderAngle,
				flipX: bow.flipX,
				alpha: 1,
			});
		}
	}
}
