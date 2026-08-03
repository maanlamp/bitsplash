import { profiler } from "../../engine/profiling/profiler";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import { hasVfxDefs } from "../../engine/vfx/vfx-registry";
import type { VfxStore } from "../../engine/vfx/vfx-store";
import { DamageEvent, DeathEvent } from "../events";
import { VFX_IDS } from "./vfx-ids";

/**
 * Squared world distance below which two points count as the same point, so a
 * bearing taken between them would be `atan2(0, 0)` rather than a direction.
 */
const MIN_BEARING_SQ = 0.0001;

/**
 * Where the spray goes when there is no usable bearing — an attacker standing
 * exactly on its victim, or damage with no attacker at all. World y points
 * down, so this is straight up.
 */
const UPWARD = -Math.PI / 2;

/**
 * Turns combat events into blood: a one-shot spurt per {@link DamageEvent}, and
 * a decal purge per {@link DeathEvent}.
 *
 * The burst goes at `hitPoint` when the emit site had one — an arrow's raycast
 * knows the exact surface point — and at the target's own centre when it did
 * not. Either way it is aimed **away from the attacker**, taking the bearing
 * from `origin` (the stimulus position) or, failing that, the source entity's
 * transform, so the spray follows the blow through instead of fountaining
 * straight up.
 *
 * The death purge is not tidying. Attached smears are keyed by entity id and
 * respawn reuses ids, so a mark left riding a corpse would reappear on whoever
 * is spawned into that slot next.
 *
 * It takes the {@link VfxStore} rather than building one: the store is shared
 * with the world's VFX update and render systems, and a second one would hold
 * particles nothing draws.
 *
 * @example
 * const vfx = createVfxSystems();
 * update: [...gameplaySystems(settings), new BloodVfxSystem(vfx.store), ...ambientSystems(vfx.update)]
 */
@profiler("Blood", "VFX")
export class BloodVfxSystem implements UpdateSystem {
	constructor(private readonly store: VfxStore) {}

	update({ ecs, events }: UpdateContext): void {
		for (const event of events.read(DeathEvent)) {
			this.store.clearDecals(event.entity);
		}
		if (!hasVfxDefs()) {
			return;
		}
		for (const event of events.read(DamageEvent)) {
			const target = ecs.getComponent(
				event.target,
				TransformComponent,
			);
			if (!target) {
				continue;
			}
			const centerX = target.position.x;
			const centerY = target.position.y;
			const source =
				event.source === null
					? undefined
					: ecs.getComponent(event.source, TransformComponent);
			const from = event.origin ?? source?.position;
			const awayX = from ? centerX - from.x : 0;
			const awayY = from ? centerY - from.y : -1;
			const spread = awayX * awayX + awayY * awayY;
			this.store.spawnBurst(
				VFX_IDS.blood,
				event.hitPoint?.x ?? centerX,
				event.hitPoint?.y ?? centerY,
				spread < MIN_BEARING_SQ ? UPWARD : Math.atan2(awayY, awayX),
			);
		}
	}
}
