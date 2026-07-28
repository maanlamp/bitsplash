import type { EntityId } from "../../engine/ecs";
import { entityTop } from "../../engine/sprite/entity-top";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import type { DynStore } from "../../engine/ui/bypass/dyn-store";
import { findById } from "../../engine/ui/input/node-tree";
import type { UiRoot } from "../../engine/ui/reconciler/ui-root";
import { getQuest } from "./loader";
import { QuestComponent } from "./quest-component";
import { QuestMarkerTagComponent } from "./quest-marker-tag-component";
import { markerNodeId } from "./quest-marker-hud";
import type { QuestMarkerHudState } from "./quest-marker-hud-state";
import { profiler } from "../../engine/profiling/profiler";

const GAP = 6;
const BOB_SPEED = 4;
const BOB_AMOUNT = 2;

@profiler("Quest marker HUD", "HUD")
export class QuestMarkerHudSystem implements UpdateSystem {
	constructor(
		private readonly store: QuestMarkerHudState,
		private readonly root: UiRoot,
		private readonly dyn: DynStore,
	) {}

	update({ ecs, assetManager, time }: UpdateContext): void {
		if (!this.hasActiveObjective(ecs)) {
			this.store.setIds([]);
			return;
		}
		const bob = Math.sin(time.elapsed * BOB_SPEED) * BOB_AMOUNT;
		const ids: EntityId[] = [];
		for (const [id, , transform] of ecs.query(
			QuestMarkerTagComponent,
			TransformComponent,
		)) {
			ids.push(id);
			const node = findById(this.root.tree, markerNodeId(id));
			if (!node) {
				continue;
			}
			const gap = GAP + bob;
			this.dyn.set(node.id, {
				worldX: transform.position.x,
				worldY:
					entityTop(ecs, assetManager, id, gap) ??
					transform.position.y - gap,
			});
		}
		this.store.setIds(ids);
	}

	private hasActiveObjective(ecs: UpdateContext["ecs"]): boolean {
		for (const [, quest] of ecs.query(QuestComponent)) {
			const def = getQuest(quest.id);
			if (!def) {
				continue;
			}
			if (
				def.objectives.some((o) => o.activeInStage === quest.stage)
			) {
				return true;
			}
		}
		return false;
	}
}
