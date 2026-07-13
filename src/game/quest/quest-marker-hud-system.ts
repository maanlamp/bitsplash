import type { EntityId } from "../../engine/ecs";
import {
	SpriteComponent,
	spriteImageUrl,
	spriteSource,
} from "../../engine/sprite/sprite-component";
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

const GAP = 6;
const BOB_SPEED = 4;
const BOB_AMOUNT = 2;

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
			let half = 0;
			const sprite = ecs.getComponent(id, SpriteComponent);
			if (sprite) {
				const image = assetManager.getImage(spriteImageUrl(sprite));
				if (image) {
					half =
						(spriteSource(sprite, image).height * transform.scale.y) /
						2;
				}
			}
			this.dyn.set(node.id, {
				worldX: transform.position.x,
				worldY: transform.position.y - half - GAP - bob,
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
