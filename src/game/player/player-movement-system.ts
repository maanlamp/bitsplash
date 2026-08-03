import { isExclusiveSequenceActive } from "../../engine/sequence/sequence-system";
import type { Seconds } from "../../engine/duration";
import { FacingComponent } from "../../engine/locomotion/facing-component";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import { touchingWall } from "../../engine/physics/grounded";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { profiler } from "../../engine/profiling/profiler";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import Vector2 from "../../engine/vector2";
import { stepMachine } from "../../engine/fsm/step-machine";
import { playerMoveMachine } from "../player/player-movement-def";
import { PlayerInputComponent } from "../player/player-input-component";
import { ACTION_IDS } from "../input/action-ids";

const approach = (
	current: number,
	target: number,
	maxDelta: number,
): number => {
	if (current < target) {
		return Math.min(current + maxDelta, target);
	}
	return Math.max(current - maxDelta, target);
};

@profiler("Player movement", "Movement")
export class PlayerMovementSystem implements UpdateSystem {
	enabled = true;

	update({ dt, ecs, actions }: UpdateContext): void {
		if (!this.enabled) {
			return;
		}
		const s = dt / 1000;
		const frozen = isExclusiveSequenceActive(ecs);
		for (const [, player, intent, facing, rb] of ecs.query(
			PlayerInputComponent,
			MovementIntentComponent,
			FacingComponent,
			PhysicsBodyComponent,
		)) {
			if (!rb.body) {
				continue;
			}
			const dir = intent.moveX;
			player.moveDir = dir;

			const dashing = this.handleDash(
				actions.active(ACTION_IDS.dash),
				player,
				facing,
				rb,
				dir,
				frozen,
				s,
			);
			let jumpType: "wall" | "normal" | null = null;
			if (!dashing) {
				const vel = rb.linearVelocity;
				const control = player.grounded ? 1 : player.airControl.value;
				const targetVx = dir * player.maxSpeed;
				const rate =
					(dir !== 0 ? player.acceleration : player.deceleration) *
					control;
				const newVx = approach(vel.x, targetVx, rate * s);
				rb.applyImpulse(
					new Vector2(rb.body.mass * (newVx - vel.x), 0),
				);

				const onWall =
					!player.grounded && dir !== 0 && this.touchingWall(rb, dir);
				player.onWall = onWall && player.canWallSlide;

				jumpType = this.handleJump(
					intent,
					player,
					rb,
					newVx,
					onWall,
					dir,
				);
				this.handleWallSlide(player, rb, onWall);
			}

			const vy = rb.linearVelocity.y;
			stepMachine(
				playerMoveMachine,
				player.move,
				{
					grounded: player.grounded,
					dir,
					vy,
					onWall: player.onWall,
					dashActive: !player.dashTime.done(),
					jumpWall: jumpType === "wall",
					jumpNormal: jumpType === "normal",
				},
				s as Seconds,
			);
			player.dashing = player.move.current === "dash";
			player.wallJumping = player.move.current === "walljump";
		}
	}

	private handleDash(
		dashActive: boolean,
		player: PlayerInputComponent,
		facing: FacingComponent,
		rb: PhysicsBodyComponent,
		dir: number,
		frozen: boolean,
		s: number,
	): boolean {
		player.dashRecovery.tick(s as Seconds);

		const dashHeld = player.canDash && !frozen && dashActive;

		if (
			dashHeld &&
			player.dashTime.done() &&
			player.dashRecovery.done()
		) {
			player.dashTime.restart(player.dashDuration.seconds);
			player.dashDir = dir !== 0 ? Math.sign(dir) : facing.dir;
			rb.body!.linearVelocity = {
				x: player.dashDir * player.dashSpeed,
				y: 0,
			};
		}

		if (player.dashTime.done()) {
			return false;
		}

		player.dashTime.tick(s as Seconds);
		if (player.dashTime.done()) {
			player.dashRecovery.restart(player.dashCooldown.seconds);
		}
		return true;
	}

	private handleWallSlide(
		player: PlayerInputComponent,
		rb: PhysicsBodyComponent,
		onWall: boolean,
	): void {
		if (!player.canWallSlide || !onWall) {
			return;
		}
		const vy = rb.linearVelocity.y;
		if (vy <= player.wallSlideSpeed) {
			return;
		}
		rb.body!.linearVelocity = {
			x: rb.linearVelocity.x,
			y: player.wallSlideSpeed,
		};
	}

	private touchingWall(
		rb: PhysicsBodyComponent,
		dir: number,
	): boolean {
		return touchingWall(rb.body!, dir);
	}

	private handleJump(
		intent: MovementIntentComponent,
		player: PlayerInputComponent,
		rb: PhysicsBodyComponent,
		vx: number,
		onWall: boolean,
		dir: number,
	): "wall" | "normal" | null {
		if (
			player.grounded &&
			!player.jumping &&
			rb.linearVelocity.y >= 0
		) {
			player.jumpsRemaining = player.maxJumps;
		} else if (
			!player.grounded &&
			player.jumpsRemaining === player.maxJumps
		) {
			player.jumpsRemaining = player.maxJumps - 1;
		}

		const jumpHeld = intent.jumpHeld;
		const jumpPressed = intent.jumpPressed;

		const wallJump =
			onWall && player.canWallSlide && player.canWallJump;

		if (jumpPressed && (player.jumpsRemaining > 0 || wallJump)) {
			const scripted = intent.jumpSpeed;
			const speed =
				scripted !== null
					? Math.min(scripted, player.maxJumpSpeed)
					: player.grounded
						? player.maxJumpSpeed
						: player.airJumpSpeed;
			const launchVx = wallJump ? -dir * player.maxSpeed : vx;
			rb.body!.linearVelocity = { x: launchVx, y: -speed };
			player.jumping = player.grounded;
			if (wallJump) {
				return "wall";
			}
			player.jumpsRemaining -= 1;
			return "normal";
		}

		if (!player.jumping) {
			return null;
		}

		const vy = rb.linearVelocity.y;
		if (vy >= 0) {
			player.jumping = false;
		} else if (
			intent.jumpSpeed === null &&
			!jumpHeld &&
			vy < -player.minJumpSpeed
		) {
			rb.body!.linearVelocity = { x: vx, y: -player.minJumpSpeed };
			player.jumping = false;
		}
		return null;
	}
}
