import { DialogueComponent } from "../../engine/dialogue/dialogue-component";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import type { DynStore } from "../../engine/ui/bypass/dyn-store";
import { findById } from "../../engine/ui/input/node-tree";
import type { UiRoot } from "../../engine/ui/reconciler/ui-root";
import { DIALOGUE_UI } from "./dialogue-ui";
import { DIALOGUE_BOX_ID, DIALOGUE_GLYPHS_ID } from "./dialogue-hud";

export class DialogueHudDynSystem extends RenderSystem {
	constructor(
		private readonly root: UiRoot,
		private readonly dyn: DynStore,
	) {
		super();
	}

	render({ ecs }: RenderContext): void {
		const [, state] = ecs.query(DialogueComponent)[0] ?? [];
		if (!state) {
			return;
		}
		const glyphs = findById(this.root.tree, DIALOGUE_GLYPHS_ID);
		if (glyphs) {
			this.dyn.setField(
				glyphs.id,
				"reveal",
				Math.floor(state.revealed),
			);
		}
		const box = findById(this.root.tree, DIALOGUE_BOX_ID);
		if (box) {
			const height = box.layoutRect?.h ?? 0;
			const slideDistance = height + DIALOGUE_UI.marginBottom;
			const offsetY = (1 - state.slide.value()) * slideDistance;
			this.dyn.setField(box.id, "offsetY", offsetY);
		}
	}
}
