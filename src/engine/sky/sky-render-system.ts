import type { MutableRGBA } from "../animation/keyframes";
import { resolveRenderLayer } from "../render/render-layers";
import { type RenderContext, RenderSystem } from "../system";
import { weatherFrame } from "../weather/weather-frame";
import { SkyComponent } from "./sky-component";
import { skyTintInto } from "./sky-tint";

/**
 * World units of overdraw on each edge of the sky quad, in screen pixels
 * divided by zoom. Covers the half-texel the world pass's `quantizeToTexel`
 * origin snap can shift the view by, so the sky never leaves a seam.
 */
const PAD_PIXELS = 2;

/**
 * Draws the scene's {@link SkyComponent} as a viewport-filling quad at the
 * bottom of the `background` layer, tinted by the weather this frame.
 *
 * The quad is placed in world space from the active camera rather than drawn in
 * screen space, because `background` is a world layer and everything in it is
 * transformed by the camera. No camera means no world pass at all
 * (`renderSceneToTexture` skips it), so no sky either — and no sky component
 * means nothing is drawn and the pass clears transparent, which is what an
 * interior or a UI-only scene wants.
 *
 * Reads `visiblePrecipitation`, the indoor-masked channels: a sky is a visual
 * consumer, so an `indoor` scene draws its authored colour untinted.
 *
 * Must come first in the render list — within one layer, submission order is
 * draw order, and the sky is behind everything.
 */
export class SkyRenderSystem implements RenderSystem {
	private readonly tint: MutableRGBA = [0, 0, 0, 1];

	render({ renderer, ecs, camera }: RenderContext): void {
		const sky = ecs.query(SkyComponent)[0]?.[1];
		if (!sky || !camera || camera.zoom <= 0) {
			return;
		}
		const zoom = camera.zoom;
		const spanX = renderer.width / zoom;
		const spanY = renderer.height / zoom;
		if (spanX <= 0 || spanY <= 0) {
			return;
		}
		const pad = PAD_PIXELS / zoom;
		skyTintInto(
			this.tint,
			sky.color.rgba,
			weatherFrame(ecs).visiblePrecipitation,
		);
		renderer.drawRect(resolveRenderLayer(ecs, "background", 0), {
			x: camera.position.x + camera.shake.x - spanX / 2 - pad,
			y: camera.position.y + camera.shake.y - spanY / 2 - pad,
			width: spanX + pad * 2,
			height: spanY + pad * 2,
			fill: this.tint,
		});
	}
}
