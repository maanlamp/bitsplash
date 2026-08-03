import type { Seconds } from "../duration";
import { SpriteComponent } from "../sprite/sprite-component";
import { TransformComponent } from "../transform-component";
import { RenderSystem, type RenderContext } from "../system";
import { resolveRenderLayer } from "../render/render-layers";
import { ambientTime } from "../weather/ambient-clock";
import {
	FoliageSwayComponent,
	foliageSwayParams,
	foliageSwayPhase,
} from "../weather/foliage-sway-component";
import { sampleWindFrame } from "../weather/sample-wind";
import { weatherFrame } from "../weather/weather-frame";
import { resolveSpriteDraw } from "./resolve-sprite-draw";

export class SpriteRenderSystem implements RenderSystem {
	render({ renderer, ecs, assetManager }: RenderContext): void {
		const now = ambientTime(ecs);
		const frame = weatherFrame(ecs);
		for (const [id, sprite, transform] of ecs.query(
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
			const height = source.height * transform.scale.y;
			const sway = ecs.getComponent(id, FoliageSwayComponent);
			const rect = {
				x: transform.position.x,
				y: transform.position.y,
				width: source.width * transform.scale.x,
				height,
				rotation: transform.rotation.radians,
				flipX: sprite.flipX,
				alpha: sprite.opacity.value,
				srcX: source.x,
				srcY: source.y,
				srcW: source.width,
				srcH: source.height,
			};
			if (!sway) {
				renderer.drawImage(layer, image, rect);
				continue;
			}
			renderer.drawSwayImage(layer, image, {
				...rect,
				sway: foliageSwayParams({
					entity: id,
					sway,
					wind: sampleWindFrame(
						frame,
						transform.position.x,
						transform.position.y,
						(now + foliageSwayPhase(id)) as Seconds,
					),
					height,
					artPixel: transform.scale.x,
					time: now,
				}),
			});
		}
	}
}
