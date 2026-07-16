import { TransformComponent } from "../../engine/transform-component";
import type { EntityId } from "../../engine/ecs";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { profiler } from "../../engine/profiling/profiler";
import { InteractableComponent } from "../interaction/interactable-component";
import { InteractionStateComponent } from "../interaction/interaction-state-component";
import { PlayerInputComponent } from "../player/player-input-component";
import { InteractEvent } from "../events";
import { ACTION_IDS } from "../input/action-ids";

@profiler("Interaction", "Interaction")
export class InteractionSystem implements UpdateSystem {
	update({ ecs, actions, events }: UpdateContext): void {
		const stateEntry = ecs.query(InteractionStateComponent)[0];
		if (!stateEntry) {
			return;
		}
		const state = stateEntry[1];

		const playerEntry = ecs.query(
			PlayerInputComponent,
			TransformComponent,
		)[0];
		if (!playerEntry) {
			state.inRange = null;
			return;
		}
		const playerId = playerEntry[0];
		const playerPosition = playerEntry[2].position;

		let nearest: EntityId | null = null;
		let nearestDist = Infinity;
		for (const [id, interactable, transform] of ecs.query(
			InteractableComponent,
			TransformComponent,
		)) {
			const dist = transform.position.distanceTo(playerPosition);
			if (dist <= interactable.radius && dist < nearestDist) {
				nearest = id;
				nearestDist = dist;
			}
		}
		state.inRange = nearest;

		if (actions.fired(ACTION_IDS.interact) && nearest) {
			events.emit(new InteractEvent(nearest, playerId));
		}
	}
}
