import {
	SpriteComponent,
	spriteImageUrl,
	spriteSource,
} from "../../engine/sprite/sprite-component";
import { TransformComponent } from "../../engine/transform-component";
import { resolveFont } from "../../engine/text/resolve-font";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { resolveRenderLayer } from "../../engine/render/render-layers";
import { BarkComponent } from "./bark-component";

const TEXT: [number, number, number, number] = [1, 1, 1, 1];
const OUTLINE: [number, number, number, number] = [0, 0, 0, 1];

export class BarkRenderSystem implements RenderSystem {
	private layer: string;

	constructor(layer: string) {
		this.layer = layer;
	}

	render({ renderer, ecs, assetManager }: RenderContext): void {
		const layer = resolveRenderLayer(ecs, this.layer);
		for (const [id, bark, transform] of ecs.query(
			BarkComponent,
			TransformComponent,
		)) {
			if (bark.text.length === 0) {
				continue;
			}
			const font = resolveFont(bark.font, assetManager);
			if (!font) {
				continue;
			}
			let spriteHalfHeight = 0;
			const sprite = ecs.getComponent(id, SpriteComponent);
			if (sprite) {
				const image = assetManager.getImage(spriteImageUrl(sprite));
				if (image) {
					const source = spriteSource(sprite, image);
					spriteHalfHeight = (source.height * transform.scale.y) / 2;
				}
			}
			const top =
				transform.position.y - spriteHalfHeight - bark.offset;
			renderer.drawText(
				layer,
				font,
				bark.text,
				transform.position.x,
				top,
				{
					align: "center",
					color: TEXT,
					outline: OUTLINE,
				},
			);
		}
	}
}
