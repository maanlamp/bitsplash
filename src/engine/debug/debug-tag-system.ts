import { PhysicsBodyComponent } from "../physics/physics-body-component";
import {
	SpriteComponent,
	spriteImageUrl,
	spriteSource,
} from "../sprite/sprite-component";
import { TransformComponent } from "../transform-component";
import { resolveFont } from "../text/resolve-font";
import { type RenderContext, RenderSystem } from "../system";
import { DebugTagComponent } from "../debug/debug-tag-component";

export class DebugTagSystem implements RenderSystem {
	private layer: number;

	constructor(layer: number) {
		this.layer = layer;
	}

	render({ renderer, ecs, assetManager }: RenderContext): void {
		for (const [id, transform, tag] of ecs.query(
			TransformComponent,
			DebugTagComponent,
		)) {
			const font = resolveFont(tag.font, assetManager);
			if (!font) {
				return;
			}
			const phys = ecs.getComponent(id, PhysicsBodyComponent);
			const sprite = ecs.getComponent(id, SpriteComponent);
			let spriteHeight = 0;
			if (sprite) {
				const image = assetManager.getImage(spriteImageUrl(sprite));
				if (image) {
					spriteHeight =
						spriteSource(sprite, image).height * transform.scale.y;
				}
			}
			const top =
				transform.position.y -
				(spriteHeight || (phys?.body ? phys.halfExtents.y : 0)) -
				4;

			renderer.drawText(
				this.layer,
				font,
				tag.label,
				transform.position.x,
				top,
				{
					align: "center",
					color: [1, 1, 1, 1],
					outline: [0, 0, 0, 1],
					bold: tag.font.variant.includes("Bold"),
					italic: tag.font.variant.includes("Italic"),
				},
			);
		}
	}
}
