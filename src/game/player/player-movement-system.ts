import { isCutsceneActive } from "../../engine/cutscene/cutscene-system";
import type { Seconds } from "../../engine/duration";
import { FacingComponent } from "../../engine/locomotion/facing-component";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import type { Input } from "../../engine/input/input";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import Vector2 from "../../engine/vector2";
import {
	type MoveState,
	playerMoveMachine,
} from "../player/player-movement-def";
import { PlayerInputComponent } from "../player/player-input-component";
import { InputBindings } from "../input-bindings";

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

export class PlayerMovementSystem implements UpdateSystem {
	enabled = true;

	update({ dt, ecs, input }: UpdateContext): void {
		if (!this.enabled) {
			return;
		}
		const s = dt / 1000;
		const frozen = isCutsceneActive(ecs);
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
				input,
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
			const result = playerMoveMachine.step(
				{
					current: player.move.current as MoveState,
					elapsed: player.move.elapsed as Seconds,
				},
				{
					grounded: player.grounded,
					dir,
					vy,
					onWall: player.onWall,
					dashActive: player.dashTimeRemaining > 0,
					jumpWall: jumpType === "wall",
					jumpNormal: jumpType === "normal",
				},
				s as Seconds,
			);
			player.move.current = result.next.current;
			player.move.elapsed = result.next.elapsed;
			player.dashing = player.move.current === "dash";
			player.wallJumping = player.move.current === "walljump";
		}
	}

	private handleDash(
		input: Input,
		player: PlayerInputComponent,
		facing: FacingComponent,
		rb: PhysicsBodyComponent,
		dir: number,
		frozen: boolean,
		s: number,
	): boolean {
		if (player.dashCooldownRemaining > 0) {
			player.dashCooldownRemaining = Math.max(
				0,
				player.dashCooldownRemaining - s * 1000,
			);
		}

		const dashHeld =
			player.canDash &&
			!frozen &&
			!!input.keyboard.keys[InputBindings.dash];
		const dashPressed = dashHeld && !player.dashWasHeld;
		player.dashWasHeld = dashHeld;

		if (
			dashPressed &&
			player.dashTimeRemaining <= 0 &&
			player.dashCooldownRemaining <= 0
		) {
			player.dashTimeRemaining = player.dashDuration.seconds * 1000;
			player.dashDir = dir !== 0 ? Math.sign(dir) : facing.dir;
			rb.body!.linearVelocity = {
				x: player.dashDir * player.dashSpeed,
				y: 0,
			};
		}

		if (player.dashTimeRemaining <= 0) {
			return false;
		}

		player.dashTimeRemaining -= s * 1000;
		if (player.dashTimeRemaining <= 0) {
			player.dashCooldownRemaining =
				player.dashCooldown.seconds * 1000;
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
		for (const { normal } of rb.body!.touchingContacts()) {
			if (dir > 0 ? normal.x > 0.5 : normal.x < -0.5) {
				return true;
			}
		}
		return false;
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
