import type { Seconds } from "../duration";
import { SpriteComponent } from "../sprite/sprite-component";
import { TransformComponent } from "../transform-component";
import { RenderSystem, type RenderContext } from "../system";
import { resolveRenderLayer } from "../render/render-layers";
import { ambientTime } from "../weather/ambient-clock";
import {
	FOLIAGE_SWAY_STILL,
	FoliageSwayComponent,
	foliageSwayOffsets,
	foliageSwayPhase,
} from "../weather/foliage-sway-component";
import { sampleWind } from "../weather/sample-wind";
import { resolveSpriteDraw } from "./resolve-sprite-draw";

export class SpriteRenderSystem implements RenderSystem {
	render({
		renderer,
		ecs,
		assetManager,
		camera,
	}: RenderContext): void {
		const now = ambientTime(ecs);
		const zoom = camera?.zoom ?? 1;
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
			const { offsetX, shear } = sway
				? foliageSwayOffsets(
						{
							entity: id,
							wind: sampleWind(
								ecs,
								transform.position.x,
								(now + foliageSwayPhase(id)) as Seconds,
							),
							height,
							amplitude: sway.amplitude,
							zoom,
						},
						sway.pinnedBase,
					)
				: FOLIAGE_SWAY_STILL;
			renderer.drawImage(layer, image, {
				x: transform.position.x + offsetX,
				y: transform.position.y,
				width: source.width * transform.scale.x,
				height,
				rotation: transform.rotation.radians,
				flipX: sprite.flipX,
				alpha: sprite.opacity.value,
				shear,
				srcX: source.x,
				srcY: source.y,
				srcW: source.width,
				srcH: source.height,
			});
		}
	}
}
