import type { Seconds } from "../../engine/duration";
import { FacingComponent } from "../../engine/locomotion/facing-component";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { profiler } from "../../engine/profiling/profiler";
import type { RigidBody } from "../../engine/physics/rigid-body";
import { Layer } from "../collision";
import { SpriteComponent } from "../../engine/sprite/sprite-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import type { World } from "../../engine/world";
import { stepMachine } from "../../engine/fsm/step-machine";
import { playerAnimMachine } from "../player/player-anim-def";
import { PlayerInputComponent } from "../player/player-input-component";

const AIRBORNE = new Set(["fall", "jump", "walljump", "wallslide"]);
const LANDING_LOOKAHEAD = 0.15;

@profiler("Player animation", "Animation")
export class PlayerAnimationSystem implements UpdateSystem {
	update({ ecs, dt, world }: UpdateContext): void {
		for (const [, player, rb, sprite, facing] of ecs.query(
			PlayerInputComponent,
			PhysicsBodyComponent,
			SpriteComponent,
			FacingComponent,
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
				(player.grounded && AIRBORNE.has(player.anim.current))
			) {
				player.landing = true;
				player.canLand = false;
			}
			if (vy < 0) {
				player.landing = false;
			} else if (
				player.landing &&
				player.anim.current === "land" &&
				sprite.finished &&
				(player.grounded || !nearGround)
			) {
				player.landing = false;
			}

			sprite.current = player.anim.current;
			sprite.flipX = facing.dir < 0;

			stepMachine(
				playerAnimMachine,
				player.anim,
				{
					grounded: player.grounded,
					onWall: player.onWall,
					wallJumping: player.wallJumping,
					landing: player.landing,
					dashing: player.dashing,
					dir,
					facing: facing.dir,
					vy,
				},
				(dt / 1000) as Seconds,
			);
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
