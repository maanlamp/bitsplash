import type { FadeTimeline } from "../../engine/animation/fade-timeline";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import type { DynStore } from "../../engine/ui/bypass/dyn-store";
import { findById } from "../../engine/ui/input/node-tree";
import type { UiRoot } from "../../engine/ui/reconciler/ui-root";
import { QuestNoticeComponent } from "../quest/quest-notice-component";
import { DeathNoticeComponent } from "../respawn/death-notice-component";
import { DEATH_OVERLAY_ID, QUEST_NOTICE_ID } from "./game-hud";

export class HudDynSystem extends RenderSystem {
	constructor(
		private readonly root: UiRoot,
		private readonly dyn: DynStore,
	) {
		super();
	}

	render({ ecs }: RenderContext): void {
		const [, death] = ecs.query(DeathNoticeComponent)[0] ?? [];
		this.applyFade(DEATH_OVERLAY_ID, death?.fade);
		const [, notice] = ecs.query(QuestNoticeComponent)[0] ?? [];
		this.applyFade(QUEST_NOTICE_ID, notice?.fade);
	}

	private applyFade(
		id: string,
		fade: FadeTimeline | undefined,
	): void {
		const node = findById(this.root.tree, id);
		if (!node) {
			return;
		}
		if (!fade) {
			this.dyn.setField(node.id, "visible", false);
			return;
		}
		this.dyn.set(node.id, { visible: true, alpha: fade.alpha() });
	}
}
