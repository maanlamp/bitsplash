import { PhysicsBodyComponent } from "../components/physics-body";
import {
	SpriteComponent,
	spriteImageUrl,
	spriteSource,
} from "../components/sprite";
import { TransformComponent } from "../components/transform";
import { resolveFont } from "../resolve-font";
import { type RenderContext, RenderSystem } from "../system";
import { DebugTagComponent } from "../components/debug-tag";

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
