import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { DamageTriggerComponent } from "../components/damage-trigger";
import { PlayerInputComponent } from "../components/player-input";
import { DamageEvent, DialogueClosedEvent } from "../events";

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
			const player = ecs.query(PlayerInputComponent)[0];
			if (!player) {
				continue;
			}
			events.emit(new DamageEvent(player[0], trigger.amount));
		}
	}
}
