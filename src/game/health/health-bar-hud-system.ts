import type { EntityId } from "../../engine/ecs";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { fadeAlpha } from "../../engine/render/color-resolver";
import { entityTop } from "../../engine/sprite/entity-top";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import type { DynStore } from "../../engine/ui/bypass/dyn-store";
import { findById } from "../../engine/ui/input/node-tree";
import type { UiRoot } from "../../engine/ui/reconciler/ui-root";
import { HealthComponent } from "./health-component";
import { HealthBarStateComponent } from "./health-bar-state-component";
import type { HealthBarHudState } from "./health-bar-hud-state";
import { healthNodeId } from "./health-bar-hud";
import { profiler } from "../../engine/profiling/profiler";

const FADE = 1;
const BAR_WIDTH = 32;

/**
 * Clearance between the top of an entity's art and the bottom of its bar.
 *
 * Larger than the other overhead HUDs' gaps on purpose: the bar hangs 5px below
 * its own anchor, and a bar tucked against the head reads as part of the
 * character. This keeps it roughly where the pre-`.bsprite` fixed `-36` put it,
 * while anchoring off the sprite content rect so it holds for entities whose art
 * does not happen to match a 16-unit physics half-height.
 */
const GAP = 16;

@profiler("Health bar HUD", "HUD")
export class HealthBarHudSystem implements UpdateSystem {
	constructor(
		private readonly store: HealthBarHudState,
		private readonly root: UiRoot,
		private readonly dyn: DynStore,
	) {}

	update({ ecs, assetManager }: UpdateContext): void {
		const ids: EntityId[] = [];
		for (const [id, health, transform, rb] of ecs.query(
			HealthComponent,
			TransformComponent,
			PhysicsBodyComponent,
		)) {
			ids.push(id);
			const container = findById(this.root.tree, healthNodeId(id));
			if (!container) {
				continue;
			}
			const bar = ecs.getComponent(id, HealthBarStateComponent);
			if (!bar || bar.visible <= 0 || !rb.body) {
				this.dyn.setField(container.id, "alpha", 0);
				continue;
			}
			const pct = Math.floor((health.hp / health.maxHp) * 100);
			const color = `color-mix(in oklch, lime ${pct}%, red)`;
			this.dyn.set(container.id, {
				alpha: fadeAlpha(bar.visible, FADE),
				worldX: transform.position.x,
				worldY:
					entityTop(ecs, assetManager, id, GAP) ??
					transform.position.y - rb.halfExtents.y * 2 - GAP,
			});
			this.setColor(
				`${healthNodeId(id)}-bg`,
				`color-mix(in oklch, ${color}, black 50%)`,
			);
			this.setWidth(
				`${healthNodeId(id)}-displayed`,
				(BAR_WIDTH / health.maxHp) * bar.displayed,
			);
			this.setWidth(
				`${healthNodeId(id)}-actual`,
				(BAR_WIDTH / health.maxHp) * health.hp,
			);
			this.setColor(`${healthNodeId(id)}-actual`, color);
		}
		this.store.setIds(ids);
	}

	private setColor(nodeId: string, color: string): void {
		const node = findById(this.root.tree, nodeId);
		if (node) {
			this.dyn.setField(node.id, "backgroundColor", color);
		}
	}

	private setWidth(nodeId: string, width: number): void {
		const node = findById(this.root.tree, nodeId);
		if (node) {
			this.dyn.setField(
				node.id,
				"width",
				Math.max(0, Math.ceil(width)),
			);
		}
	}
}
