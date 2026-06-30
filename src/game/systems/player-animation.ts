import { PhysicsBodyComponent } from "../../engine/components/physics-body";
import type { RigidBody } from "../../engine/physics/rigid-body";
import { Layer } from "../collision";
import { SpriteComponent } from "../../engine/components/sprite";
import { StateMachineComponent } from "../../engine/fsm/state-machine-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import type { World } from "../../engine/world";
import { PlayerInputComponent } from "../components/player-input";

const AIRBORNE = new Set(["fall", "jump", "walljump", "wallslide"]);
const LANDING_LOOKAHEAD = 0.15;

export class PlayerAnimationSystem implements UpdateSystem {
	update({ ecs, world }: UpdateContext): void {
		for (const [, player, rb, sm, sprite] of ecs.query(
			PlayerInputComponent,
			PhysicsBodyComponent,
			StateMachineComponent,
			SpriteComponent,
		)) {
			if (!rb.body) {
				continue;
			}
			const dir = player.moveDir;

			const vy = rb.linearVelocity.y;
			const pos = rb.body.position;
			const nearGround =
				vy > 0 &&
				!player.grounded &&
				this.groundBelow(
					world,
					rb.body,
					pos.x,
					pos.y,
					rb.halfExtents.y + vy * LANDING_LOOKAHEAD,
				);

			if (player.grounded) {
				player.canLand = true;
			}
			if (
				(player.canLand && nearGround) ||
				(player.grounded && AIRBORNE.has(sm.current))
			) {
				player.landing = true;
				player.canLand = false;
			}
			if (vy < 0) {
				player.landing = false;
			} else if (
				player.landing &&
				sm.current === "land" &&
				sprite.finished &&
				(player.grounded || !nearGround)
			) {
				player.landing = false;
			}

			sm.params.grounded = player.grounded;
			sm.params.vy = vy;
			sm.params.dir = dir;
			sm.params.onWall = player.onWall;
			sm.params.wallJumping = player.wallJumping;
			sm.params.landing = player.landing;
			sm.params.dashing = player.dashing;

			sprite.current = sm.current || sm.def?.initial || "idle";

			if (player.dashing) {
				sprite.flipX = player.dashDir < 0;
			} else if (dir !== 0) {
				sprite.flipX = dir < 0;
			}
		}
	}

	private groundBelow(
		world: World,
		body: RigidBody,
		x: number,
		y: number,
		reach: number,
	): boolean {
		return (
			world.raycast(
				{ x, y },
				{ x, y: y + reach },
				(other) =>
					other !== body &&
					!other.isSensor &&
					(other.collisionLayer === Layer.Terrain ||
						other.collisionLayer === Layer.Crate),
			) !== null
		);
	}
}
