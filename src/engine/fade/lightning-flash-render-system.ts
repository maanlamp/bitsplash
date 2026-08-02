import {
	type RenderContext,
	RenderSystem,
	screenMetrics,
} from "../system";
import { UI_LAYER_MIN } from "../ui";
import {
	FLASH_BANDS,
	FLASH_SCREEN_AREA,
	FLASH_TINT,
	lightningFlashAlpha,
} from "./lightning-flash";

/**
 * Draws the lightning flash as a screen-space band across the top of the frame.
 *
 * Screen space, so it needs a UI layer: world layers are drawn through the
 * camera and a flash that panned with the level would be wrong. It draws at
 * {@link UI_LAYER_MIN}, the base of the UI pass, and the render list puts this
 * system before the HUD's — so the flash lights the scene and the HUD stays
 * legible over it.
 *
 * The band is split into {@link FLASH_BANDS} strips of falling alpha rather than
 * one rectangle, which gives the vertical falloff of sky lighting up and avoids
 * a hard horizontal edge across the frame. Their combined area is
 * {@link FLASH_SCREEN_AREA}, inside the photosensitivity envelope's ceiling.
 */
export class LightningFlashRenderSystem extends RenderSystem {
	private readonly px = [0, 0, 0, 0];
	private readonly py = [0, 0, 0, 0];

	render(ctx: RenderContext): void {
		const alpha = lightningFlashAlpha(ctx.ecs);
		if (alpha <= 0) {
			return;
		}
		const { width, height } = screenMetrics(ctx);
		const band = (height * FLASH_SCREEN_AREA) / FLASH_BANDS;
		this.px[0] = 0;
		this.px[1] = width;
		this.px[2] = width;
		this.px[3] = 0;
		for (let i = 0; i < FLASH_BANDS; i++) {
			this.py[0] = i * band;
			this.py[1] = this.py[0];
			this.py[2] = this.py[0] + band;
			this.py[3] = this.py[2];
			ctx.renderer.drawCornerQuad(UI_LAYER_MIN, {
				px: this.px,
				py: this.py,
				tint: [FLASH_TINT[0], FLASH_TINT[1], FLASH_TINT[2], 1],
				alpha: alpha * (1 - i / FLASH_BANDS),
				blend: "additive",
			});
		}
	}
}
