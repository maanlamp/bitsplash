import type { Seconds } from "../../engine/duration";
import type { EntityId } from "../../engine/ecs";
import { profiler } from "../../engine/profiling/profiler";
import { entityTop } from "../../engine/sprite/entity-top";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import type { DynStore } from "../../engine/ui/bypass/dyn-store";
import { findById } from "../../engine/ui/input/node-tree";
import type { UiRoot } from "../../engine/ui/reconciler/ui-root";
import { DpsMeterComponent } from "./dps-meter-component";
import { DPS_METER_POOL_SIZE, dpsMeterNodeId } from "./dps-meter-hud";

/** Seconds of the idle countdown's tail the number fades over. */
const FADE = 0.5 as Seconds;

/** Clearance between the top of the entity's art and the number. */
const GAP = 18;

/**
 * Paints each entity's DPS readout into a slot of the fixed text pool, floating
 * above its art and fading over the tail of the idle countdown.
 *
 * Slot bookkeeping runs on two instance-owned parallel arrays rather than a
 * `Map` and a `Set` per frame, so the steady-state path allocates nothing; the
 * text itself is built by `DpsMeterSystem` only when the rate changes.
 */
@profiler("DPS meter HUD", "HUD")
export class DpsMeterHudSystem implements UpdateSystem {
	private readonly slotEntity = Array.from<EntityId | null>({
		length: DPS_METER_POOL_SIZE,
	}).fill(null);

	private readonly slotActive = new Uint8Array(DPS_METER_POOL_SIZE);

	constructor(
		private readonly root: UiRoot,
		private readonly dyn: DynStore,
	) {}

	update({ ecs, assetManager }: UpdateContext): void {
		this.slotActive.fill(0);
		for (const [id, meter, transform] of ecs.query(
			DpsMeterComponent,
			TransformComponent,
		)) {
			if (meter.count === 0) {
				continue;
			}
			const slot = this.slotFor(id);
			if (slot < 0) {
				continue;
			}
			this.slotActive[slot] = 1;
			const node = findById(this.root.tree, dpsMeterNodeId(slot));
			if (!node) {
				continue;
			}
			this.dyn.setField(node.id, "visible", true);
			this.dyn.setField(node.id, "alpha", meter.idle.fadeOut(FADE));
			this.dyn.setField(node.id, "text", meter.text);
			this.dyn.setField(node.id, "worldX", transform.position.x);
			this.dyn.setField(
				node.id,
				"worldY",
				entityTop(ecs, assetManager, id, GAP) ??
					transform.position.y - GAP,
			);
		}

		for (let slot = 0; slot < DPS_METER_POOL_SIZE; slot++) {
			if (this.slotActive[slot] === 0) {
				this.slotEntity[slot] = null;
				this.hide(slot);
			}
		}
	}

	/** The slot already held by `id`, else a free one, else `-1`. */
	private slotFor(id: EntityId): number {
		for (let slot = 0; slot < DPS_METER_POOL_SIZE; slot++) {
			if (this.slotEntity[slot] === id) {
				return slot;
			}
		}
		for (let slot = 0; slot < DPS_METER_POOL_SIZE; slot++) {
			if (this.slotEntity[slot] === null) {
				this.slotEntity[slot] = id;
				return slot;
			}
		}
		return -1;
	}

	private hide(slot: number): void {
		const node = findById(this.root.tree, dpsMeterNodeId(slot));
		if (node) {
			this.dyn.setField(node.id, "visible", false);
		}
	}
}
