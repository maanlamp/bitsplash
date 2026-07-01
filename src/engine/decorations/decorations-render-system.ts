import type { Decorations } from "../decorations/decorations";
import { type RenderContext, RenderSystem } from "../system";

export class DecorationsRenderSystem implements RenderSystem {
	private decorations: Decorations;

	constructor(decorations: Decorations) {
		this.decorations = decorations;
	}

	render({ renderer }: RenderContext): void {
		this.decorations.render(renderer);
	}
}
