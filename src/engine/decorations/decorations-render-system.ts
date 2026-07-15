import type { DecorationsRenderer } from "../decorations/decorations";
import { type RenderContext, RenderSystem } from "../system";

export class DecorationsRenderSystem implements RenderSystem {
	private decorations: DecorationsRenderer;

	constructor(decorations: DecorationsRenderer) {
		this.decorations = decorations;
	}

	render({ renderer, ecs }: RenderContext): void {
		this.decorations.render(renderer, ecs);
	}
}
