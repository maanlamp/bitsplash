import type { EntityId } from "../../engine/ecs";
import { fadeAlpha } from "../../engine/render/color-resolver";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import type { DynStore } from "../../engine/ui/bypass/dyn-store";
import { findById } from "../../engine/ui/input/node-tree";
import type { UiRoot } from "../../engine/ui/reconciler/ui-root";
import { HitsplatComponent } from "./hitsplat-component";
import { HitsplatStyleComponent } from "./hitsplat-style-component";
import {
	HITSPLAT_POOL_SIZE,
	hitsplatFlavourId,
	hitsplatMainId,
} from "./hitsplat-hud";
import { profiler } from "../../engine/profiling/profiler";

@profiler("Hitsplat HUD", "HUD")
export class HitsplatHudSystem implements UpdateSystem {
	private readonly slotOf = new Map<EntityId, number>();

	constructor(
		private readonly root: UiRoot,
		private readonly dyn: DynStore,
	) {}

	update({ ecs }: UpdateContext): void {
		const style = ecs.queryFirst(HitsplatStyleComponent)?.[1];
		const list = ecs.query(HitsplatComponent, TransformComponent);
		const active = new Set<EntityId>(list.map(([id]) => id));

		const stale: Array<[EntityId, number]> = [];
		for (const entry of this.slotOf) {
			if (!active.has(entry[0])) {
				stale.push(entry);
			}
		}
		for (const [id, slot] of stale) {
			this.slotOf.delete(id);
			this.hide(slot);
		}

		const used = new Set<number>();
		if (style) {
			for (const [id, hitsplat, transform] of list) {
				let slot = this.slotOf.get(id);
				if (slot === undefined) {
					slot = this.freeSlot(used);
					if (slot === undefined) {
						continue;
					}
					this.slotOf.set(id, slot);
				}
				used.add(slot);
				this.paintSlot(slot, id, hitsplat, transform, style);
			}
		}

		for (let slot = 0; slot < HITSPLAT_POOL_SIZE; slot++) {
			if (!used.has(slot)) {
				this.hide(slot);
			}
		}
	}

	private paintSlot(
		slot: number,
		id: EntityId,
		hitsplat: HitsplatComponent,
		transform: TransformComponent,
		style: HitsplatStyleComponent,
	): void {
		const alpha = fadeAlpha(
			hitsplat.lifetime - hitsplat.age,
			hitsplat.lifetime * style.fadePortion.value,
		);
		const scale = this.popScale(hitsplat, style);
		const fill = (
			hitsplat.incoming
				? style.incomingColor
				: hitsplat.crit
					? style.critColor
					: style.color
		).rgba;

		const main = findById(this.root.tree, hitsplatMainId(slot));
		if (main) {
			this.dyn.set(main.id, {
				visible: true,
				alpha,
				scale,
				color: fill,
				text: hitsplat.text,
				font: hitsplat.crit ? style.critFont : style.font,
				worldX: transform.position.x,
				worldY: transform.position.y,
				rotation: 0,
			});
		}

		const flavour = findById(this.root.tree, hitsplatFlavourId(slot));
		if (!flavour) {
			return;
		}
		if (hitsplat.crit && hitsplat.flavour) {
			const offset = (style.critFont.size + 2) * scale;
			this.dyn.set(flavour.id, {
				visible: true,
				alpha,
				scale,
				color: fill,
				text: hitsplat.flavour,
				font: style.critFont,
				worldX: transform.position.x,
				worldY: transform.position.y - offset,
				rotation: this.tilt(id) * style.flavourTilt.radians,
			});
		} else {
			this.dyn.setField(flavour.id, "visible", false);
		}
	}

	private hide(slot: number): void {
		const main = findById(this.root.tree, hitsplatMainId(slot));
		if (main) {
			this.dyn.setField(main.id, "visible", false);
		}
		const flavour = findById(this.root.tree, hitsplatFlavourId(slot));
		if (flavour) {
			this.dyn.setField(flavour.id, "visible", false);
		}
	}

	private freeSlot(used: Set<number>): number | undefined {
		const taken = new Set<number>(used);
		for (const slot of this.slotOf.values()) {
			taken.add(slot);
		}
		for (let slot = 0; slot < HITSPLAT_POOL_SIZE; slot++) {
			if (!taken.has(slot)) {
				return slot;
			}
		}
		return undefined;
	}

	private popScale(
		hitsplat: HitsplatComponent,
		style: HitsplatStyleComponent,
	): number {
		if (!hitsplat.crit || hitsplat.age >= style.popDuration.seconds) {
			return 1;
		}
		const t = hitsplat.age / style.popDuration.seconds;
		return style.popScale + (1 - style.popScale) * t;
	}

	private tilt(id: EntityId): number {
		let hash = 0;
		for (let i = 0; i < id.length; i++) {
			hash = (hash * 31 + id.charCodeAt(i)) | 0;
		}
		return (Math.abs(hash % 2001) - 1000) / 1000;
	}
}
