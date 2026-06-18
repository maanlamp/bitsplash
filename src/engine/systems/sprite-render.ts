import {
	SpriteComponent,
	spriteImageUrl,
	spriteSource,
} from "../components/sprite";
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
			const image = assetManager.getImage(spriteImageUrl(sprite));
			if (!image) {
				continue;
			}
			const source = spriteSource(sprite, image);
			renderer.drawImage(this.layer, image, {
				x: transform.position.x,
				y: transform.position.y,
				width: source.width * transform.scale.x,
				height: source.height * transform.scale.y,
				rotation: transform.rotation.radians,
				flipX: sprite.flipX,
				alpha: sprite.opacity,
				srcX: source.x,
				srcY: source.y,
				srcW: source.width,
				srcH: source.height,
			});
		}
	}
}
