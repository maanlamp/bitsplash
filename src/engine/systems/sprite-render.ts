import { SpriteComponent } from "../components/sprite";
import { TransformComponent } from "../components/transform";
import { RenderSystem, type RenderContext } from "../system";

export class SpriteRenderSystem implements RenderSystem {
	layer: number;

	constructor(layer: number) {
		this.layer = layer;
	}

	render({ renderer, ecs, assetManager }: RenderContext): void {
		for (const [, sprite, transform] of ecs.query(
			SpriteComponent,
			TransformComponent,
		)) {
			const image = assetManager.getImage(sprite.url);
			if (!image) {
				continue;
			}
			renderer.drawImage(this.layer, image, {
				x: transform.position.x,
				y: transform.position.y,
				width: sprite.width,
				height: sprite.height,
				rotation: transform.rotation.radians,
				flipX: sprite.flipX,
				alpha: sprite.opacity,
			});
		}
	}
}
