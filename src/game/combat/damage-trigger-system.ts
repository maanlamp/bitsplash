import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { DialogueClosedEvent } from "../../engine/dialogue/events";
import { profiler } from "../../engine/profiling/profiler";
import { DamageStatsComponent } from "../combat/damage-stats-component";
import { DamageTriggerComponent } from "../combat/damage-trigger-component";
import { resolveHit, NO_MODIFIERS } from "../combat/resolve-hit";
import { PlayerInputComponent } from "../player/player-input-component";
import { DamageEvent } from "../events";

@profiler("Damage triggers", "Combat")
export class DamageTriggerSystem implements UpdateSystem {
	update({ ecs, events }: UpdateContext): void {
		for (const event of events.read(DialogueClosedEvent)) {
			if (!event.source) {
				continue;
			}
			const trigger = ecs.getComponent(
				event.source,
				DamageTriggerComponent,
			);
			if (!trigger) {
				continue;
			}
			const stats = ecs.getComponent(
				event.source,
				DamageStatsComponent,
			);
			if (!stats) {
				continue;
			}
			const player = ecs.query(PlayerInputComponent)[0];
			if (!player) {
				continue;
			}
			const { amount, crit } = resolveHit(stats, NO_MODIFIERS);
			events.emit(
				new DamageEvent(
					player[0],
					amount,
					crit,
					stats.flavourSet,
					event.source,
				),
			);
		}
	}
}
