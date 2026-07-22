import { isExclusiveSequenceActive } from "../../engine/sequence/sequence-system";
import { resolveRenderLayer } from "../../engine/render/render-layers";
import { resolveSpriteDraw } from "../../engine/sprite/resolve-sprite-draw";
import { SpriteComponent } from "../../engine/sprite/sprite-component";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import { InteractionStateComponent } from "./interaction-state-component";

export class InteractOutlineRenderSystem implements RenderSystem {
	constructor(private outlineLayer: string) {}

	render({ renderer, ecs, assetManager }: RenderContext): void {
		if (isExclusiveSequenceActive(ecs)) {
			return;
		}
		const stateEntry = ecs.query(InteractionStateComponent)[0];
		if (!stateEntry) {
			return;
		}
		const inRange = stateEntry[1].inRange;
		if (!inRange) {
			return;
		}
		const transform = ecs.getComponent(inRange, TransformComponent);
		const sprite = ecs.getComponent(inRange, SpriteComponent);
		if (!transform || !sprite) {
			return;
		}
		const draw = resolveSpriteDraw(sprite, assetManager);
		if (!draw) {
			return;
		}
		const { image, source } = draw;
		renderer.drawImageOutline(
			resolveRenderLayer(ecs, this.outlineLayer),
			image,
			{
				x: transform.position.x,
				y: transform.position.y,
				width: source.width * transform.scale.x,
				height: source.height * transform.scale.y,
				rotation: transform.rotation.radians,
				flipX: sprite.flipX,
				srcX: source.x,
				srcY: source.y,
				srcW: source.width,
				srcH: source.height,
			},
		);
	}
}
