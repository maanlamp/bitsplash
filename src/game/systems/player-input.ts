import { RigidbodyComponent } from "../../engine/components/rigidbody";
import type { Input } from "../../engine/input/input";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import Vector2 from "../../engine/vector2";
import { PlayerInputComponent } from "../components/player-input";
import { PlayerMovementStateComponent } from "../components/player-movement-state";
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

export class PlayerInputSystem implements UpdateSystem {
	enabled = true;

	update({ dt, ecs, input }: UpdateContext): void {
		if (!this.enabled) {
			return;
		}
		const s = dt / 1000;
		for (const [, player, state, rb] of ecs.query(
			PlayerInputComponent,
			PlayerMovementStateComponent,
			RigidbodyComponent,
		)) {
			let dir = 0;
			if (input.keyboard.keys[InputBindings.left]) {
				dir -= 1;
			}
			if (input.keyboard.keys[InputBindings.right]) {
				dir += 1;
			}

			const vel = rb.linearVelocity;
			const control = state.grounded ? 1 : player.airControl;
			const targetVx = dir * player.maxSpeed;
			const rate =
				(dir !== 0 ? player.acceleration : player.deceleration) *
				control;
			const newVx = approach(vel.x, targetVx, rate * s);
			rb.applyImpulse(
				new Vector2(rb.body.getMass() * (newVx - vel.x), 0),
			);

			const onWall =
				!state.grounded && dir !== 0 && this.touchingWall(rb, dir);
			state.onWall = onWall && player.canWallSlide;
			if (state.grounded || onWall) {
				state.wallJumping = false;
			}

			this.handleJump(input, player, state, rb, newVx, onWall, dir);
			this.handleWallSlide(player, rb, onWall);
		}
	}

	private handleWallSlide(
		player: PlayerInputComponent,
		rb: RigidbodyComponent,
		onWall: boolean,
	): void {
		if (!player.canWallSlide || !onWall) {
			return;
		}
		const vy = rb.linearVelocity.y;
		if (vy <= player.wallSlideSpeed) {
			return;
		}
		rb.body.setLinearVelocity({
			x: rb.linearVelocity.x,
			y: player.wallSlideSpeed,
		});
	}

	private touchingWall(rb: RigidbodyComponent, dir: number): boolean {
		for (
			let edge = rb.body.getContactList();
			edge;
			edge = edge.next ?? null
		) {
			const contact = edge.contact;
			if (!contact.isTouching()) {
				continue;
			}
			const worldManifold = contact.getWorldManifold(null);
			if (!worldManifold) {
				continue;
			}
			const normal = worldManifold.normal;
			const isA = rb.body === contact.getFixtureA().getBody();
			const nx = isA ? normal.x : -normal.x;
			if (dir > 0 ? nx > 0.5 : nx < -0.5) {
				return true;
			}
		}
		return false;
	}

	private handleJump(
		input: Input,
		player: PlayerInputComponent,
		state: PlayerMovementStateComponent,
		rb: RigidbodyComponent,
		vx: number,
		onWall: boolean,
		dir: number,
	): void {
		if (
			state.grounded &&
			!state.jumping &&
			rb.linearVelocity.y >= 0
		) {
			state.jumpsRemaining = player.maxJumps;
		} else if (
			!state.grounded &&
			state.jumpsRemaining === player.maxJumps
		) {
			state.jumpsRemaining = player.maxJumps - 1;
		}

		const jumpHeld = !!input.keyboard.keys[InputBindings.jump];
		const jumpPressed = jumpHeld && !state.jumpWasHeld;
		state.jumpWasHeld = jumpHeld;

		const wallJump =
			onWall && player.canWallSlide && player.canWallJump;

		if (jumpPressed && (state.jumpsRemaining > 0 || wallJump)) {
			const speed = state.grounded
				? player.maxJumpSpeed
				: player.airJumpSpeed;
			const launchVx = wallJump ? -dir * player.maxSpeed : vx;
			rb.body.setLinearVelocity({ x: launchVx, y: -speed });
			if (wallJump) {
				state.wallJumping = true;
			} else {
				state.jumpsRemaining -= 1;
			}
			state.jumping = state.grounded;
			return;
		}

		if (!state.jumping) {
			return;
		}

		const vy = rb.linearVelocity.y;
		if (vy >= 0) {
			state.jumping = false;
		} else if (!jumpHeld && vy < -player.minJumpSpeed) {
			rb.body.setLinearVelocity({ x: vx, y: -player.minJumpSpeed });
			state.jumping = false;
		}
	}
}
