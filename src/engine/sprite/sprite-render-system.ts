import { SpriteComponent } from "../sprite/sprite-component";
import { TransformComponent } from "../transform-component";
import { RenderSystem, type RenderContext } from "../system";
import { resolveRenderLayer } from "../render/render-layers";
import { resolveSpriteDraw } from "./resolve-sprite-draw";

export class SpriteRenderSystem implements RenderSystem {
	render({ renderer, ecs, assetManager }: RenderContext): void {
		for (const [, sprite, transform] of ecs.query(
			SpriteComponent,
			TransformComponent,
		)) {
			const draw = resolveSpriteDraw(sprite, assetManager);
			if (!draw) {
				continue;
			}
			const { image, source } = draw;
			const layer = resolveRenderLayer(
				ecs,
				sprite.renderLayer,
				sprite.order,
			);
			renderer.drawImage(layer, image, {
				x: transform.position.x,
				y: transform.position.y,
				width: source.width * transform.scale.x,
				height: source.height * transform.scale.y,
				rotation: transform.rotation.radians,
				flipX: sprite.flipX,
				alpha: sprite.opacity.value,
				srcX: source.x,
				srcY: source.y,
				srcW: source.width,
				srcH: source.height,
			});
		}
	}
}
