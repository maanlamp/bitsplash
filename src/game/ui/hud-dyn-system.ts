import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import type { DynStore } from "../../engine/ui/bypass/dyn-store";
import { findById } from "../../engine/ui/input/node-tree";
import type { UiRoot } from "../../engine/ui/reconciler/ui-root";
import {
	DEATH_OVERLAY_ID,
	type NoticeSlot,
	QUEST_NOTICE_ID,
} from "./hud-ids";
import { NoticeComponent } from "./notice-component";

/**
 * Fades each HUD notice node to its notice's current alpha, and hides a node
 * whose notice has expired. Two notices in the same slot do not queue: the
 * first one found wins, as it always has.
 */
export class HudDynSystem extends RenderSystem {
	constructor(
		private readonly root: UiRoot,
		private readonly dyn: DynStore,
	) {
		super();
	}

	render({ ecs }: RenderContext): void {
		let death: NoticeComponent | undefined;
		let quest: NoticeComponent | undefined;
		for (const [, notice] of ecs.query(NoticeComponent)) {
			if (notice.slot === DEATH_OVERLAY_ID) {
				death ??= notice;
			} else if (notice.slot === QUEST_NOTICE_ID) {
				quest ??= notice;
			}
		}
		this.applyFade(DEATH_OVERLAY_ID, death);
		this.applyFade(QUEST_NOTICE_ID, quest);
	}

	private applyFade(
		slot: NoticeSlot,
		notice: NoticeComponent | undefined,
	): void {
		const node = findById(this.root.tree, slot);
		if (!node) {
			return;
		}
		if (!notice) {
			this.dyn.setField(node.id, "visible", false);
			return;
		}
		this.dyn.set(node.id, {
			visible: true,
			alpha: notice.alpha.sample(notice.timeline.t()),
		});
	}
}
