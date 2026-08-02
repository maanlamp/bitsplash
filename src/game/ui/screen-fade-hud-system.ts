import { ScreenFadeComponent } from "../../engine/fade/screen-fade-component";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import type { DynStore } from "../../engine/ui/bypass/dyn-store";
import { findById } from "../../engine/ui/input/node-tree";
import type { UiRoot } from "../../engine/ui/reconciler/ui-root";
import { SCREEN_FADE_ID } from "./screen-fade";

export class ScreenFadeHudSystem extends RenderSystem {
	constructor(
		private readonly root: UiRoot,
		private readonly dyn: DynStore,
	) {
		super();
	}

	render({ ecs }: RenderContext): void {
		const node = findById(this.root.tree, SCREEN_FADE_ID);
		if (!node) {
			return;
		}
		const [, fade] = ecs.queryFirst(ScreenFadeComponent) ?? [];
		const alpha = fade ? Math.min(1, Math.max(0, fade.alpha)) : 0;
		this.dyn.setField(node.id, "alpha", alpha);
	}
}
