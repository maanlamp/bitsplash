import { ScreenFadeComponent } from "../components/screen-fade";
import { type RenderContext, RenderSystem } from "../system";
import { UI_LAYER_FADE } from "../ui";

export class ScreenFadeRenderSystem implements RenderSystem {
	render({ renderer, ecs }: RenderContext): void {
		const [, fade] = ecs.query(ScreenFadeComponent)[0] ?? [];
		if (!fade || fade.alpha <= 0) {
			return;
		}
		renderer.drawRect(UI_LAYER_FADE, {
			x: 0,
			y: 0,
			width: renderer.width,
			height: renderer.height,
			fill: [0, 0, 0, Math.min(1, fade.alpha)],
		});
	}
}
