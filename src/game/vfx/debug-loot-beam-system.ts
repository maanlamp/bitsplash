import type { EntityId } from "../../engine/ecs";
import { profiler } from "../../engine/profiling/profiler";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import { DeathEvent } from "../events";
import {
	LOOT_VISUAL_CLASSES,
	type LootVisualClass,
	spawnLootBeam,
} from "./loot-beam";

/**
 * **DEBUG SCAFFOLDING — delete with this file.**
 *
 * Beams a randomly chosen visual class over every corpse, so a play session
 * shows all five without any loot existing yet. Kill an enemy or a guard in
 * `bun run dev` and a beam stands where it fell.
 *
 * Its real consumer is the loot plan's Phase 1, which calls {@link spawnLootBeam}
 * on an actual drop with an actual rarity. When that lands, delete this file and
 * its one line in `compositions.ts`; nothing else references it.
 *
 * The corpse is destroyed the same frame it dies, so the beam rides a **marker
 * entity** created here instead: a transform at the death position, beamed and
 * then destroyed on a timer this system owns. That destruction is what
 * exercises host-death live-out — the beam ages out through its authored alpha
 * tracks rather than vanishing.
 */

/** How long a debug beam stands before its marker is destroyed, seconds. */
const BEAM_SECONDS = 8;

/** One standing debug beam and what is left of its stay. */
type DebugBeam = { marker: EntityId; remaining: number };

@profiler("DebugLootBeam", "VFX")
export class DebugLootBeamSystem implements UpdateSystem {
	private readonly beams: DebugBeam[] = [];

	update({ ecs, events, time }: UpdateContext): void {
		for (const event of events.read(DeathEvent)) {
			const transform = ecs.getComponent(
				event.entity,
				TransformComponent,
			);
			if (!transform) {
				continue;
			}
			const marker = ecs.createEntity([
				new TransformComponent(transform.position.clone()),
			]);
			spawnLootBeam(ecs, marker, randomVisualClass());
			this.beams.push({ marker, remaining: BEAM_SECONDS });
		}
		for (let i = this.beams.length - 1; i >= 0; i--) {
			const beam = this.beams[i]!;
			beam.remaining -= time.dt;
			if (beam.remaining > 0) {
				continue;
			}
			ecs.destroy(beam.marker);
			this.beams.splice(i, 1);
		}
	}
}

const randomVisualClass = (): LootVisualClass =>
	LOOT_VISUAL_CLASSES[
		Math.floor(Math.random() * LOOT_VISUAL_CLASSES.length)
	]!;
