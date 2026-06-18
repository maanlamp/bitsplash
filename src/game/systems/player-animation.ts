import { RigidbodyComponent } from "../../engine/components/rigidbody";
import { SpriteComponent } from "../../engine/components/sprite";
import { StateMachineComponent } from "../../engine/fsm/state-machine-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { PlayerInputComponent } from "../components/player-input";
import { PlayerMovementStateComponent } from "../components/player-movement-state";
import { InputBindings } from "../input-bindings";

export class PlayerAnimationSystem implements UpdateSystem {
	update({ ecs, input }: UpdateContext): void {
		for (const [, , state, rb, sm, sprite] of ecs.query(
			PlayerInputComponent,
			PlayerMovementStateComponent,
			RigidbodyComponent,
			StateMachineComponent,
			SpriteComponent,
		)) {
			let dir = 0;
			if (input.keyboard.keys[InputBindings.left]) {
				dir -= 1;
			}
			if (input.keyboard.keys[InputBindings.right]) {
				dir += 1;
			}

			sm.params.grounded = state.grounded;
			sm.params.vy = rb.linearVelocity.y;
			sm.params.dir = dir;

			sprite.current = sm.current || sm.def?.initial || "idle";

			if (dir !== 0) {
				sprite.flipX = dir < 0;
			}
		}
	}
}
