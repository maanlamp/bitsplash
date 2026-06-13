import { TransformComponent } from "../../engine/components/transform";
import type { EntityId } from "../../engine/ecs";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { InteractableComponent } from "../components/interactable";
import { InteractionStateComponent } from "../components/interaction-state";
import { PlayerInputComponent } from "../components/player-input";
import { InteractEvent } from "../events";
import { InputBindings } from "../input-bindings";

export class InteractionSystem implements UpdateSystem {
	update({ ecs, input, events }: UpdateContext): void {
		const stateEntry = ecs.query(InteractionStateComponent)[0];
		if (!stateEntry) {
			return;
		}
		const state = stateEntry[1];

		const held = !!input.keyboard.keys[InputBindings.interact];
		state.pressedThisFrame = held && !state.interactWasHeld;
		state.interactWasHeld = held;

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

		if (state.pressedThisFrame && nearest) {
			events.emit(new InteractEvent(nearest, playerId));
		}
	}
}
