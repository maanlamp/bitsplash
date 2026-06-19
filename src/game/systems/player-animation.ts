import type { Body } from "planck";
import { RigidbodyComponent } from "../../engine/components/rigidbody";
import { SpriteComponent } from "../../engine/components/sprite";
import { StateMachineComponent } from "../../engine/fsm/state-machine-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import type { World } from "../../engine/world";
import { PlayerInputComponent } from "../components/player-input";
import { PlayerMovementStateComponent } from "../components/player-movement-state";
import { InputBindings } from "../input-bindings";

const AIRBORNE = new Set(["fall", "jump", "walljump", "wallslide"]);
const LANDING_LOOKAHEAD = 0.15;

export class PlayerAnimationSystem implements UpdateSystem {
	update({ ecs, input, world }: UpdateContext): void {
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

			const vy = rb.linearVelocity.y;
			const pos = rb.body.getPosition();
			const nearGround =
				vy > 0 &&
				!state.grounded &&
				this.groundBelow(
					world,
					rb.body,
					pos.x,
					pos.y,
					rb.halfExtents.y + vy * LANDING_LOOKAHEAD,
				);

			if (state.grounded) {
				state.canLand = true;
			}
			if (
				(state.canLand && nearGround) ||
				(state.grounded && AIRBORNE.has(sm.current))
			) {
				state.landing = true;
				state.canLand = false;
			}
			if (vy < 0) {
				state.landing = false;
			} else if (
				state.landing &&
				sm.current === "land" &&
				sprite.finished &&
				(state.grounded || !nearGround)
			) {
				state.landing = false;
			}

			sm.params.grounded = state.grounded;
			sm.params.vy = vy;
			sm.params.dir = dir;
			sm.params.onWall = state.onWall;
			sm.params.wallJumping = state.wallJumping;
			sm.params.landing = state.landing;

			sprite.current = sm.current || sm.def?.initial || "idle";

			if (dir !== 0) {
				sprite.flipX = dir < 0;
			}
		}
	}

	private groundBelow(
		world: World,
		body: Body,
		x: number,
		y: number,
		reach: number,
	): boolean {
		let hit = false;
		world.physics.rayCast(
			{ x, y },
			{ x, y: y + reach },
			(fixture) => {
				const other = fixture.getBody();
				if (
					other === body ||
					fixture.isSensor() ||
					fixture.getFilterGroupIndex() < 0
				) {
					return -1;
				}
				hit = true;
				return 0;
			},
		);
		return hit;
	}
}
