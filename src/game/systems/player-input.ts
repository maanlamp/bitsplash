import { PhysicsBodyComponent } from "../../engine/components/physics-body";
import type { Input } from "../../engine/input/input";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import Vector2 from "../../engine/vector2";
import { PlayerInputComponent } from "../components/player-input";
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
		for (const [, player, rb] of ecs.query(
			PlayerInputComponent,
			PhysicsBodyComponent,
		)) {
			if (!rb.body) {
				continue;
			}
			let dir = 0;
			if (input.keyboard.keys[InputBindings.left]) {
				dir -= 1;
			}
			if (input.keyboard.keys[InputBindings.right]) {
				dir += 1;
			}

			const vel = rb.linearVelocity;
			const control = player.grounded ? 1 : player.airControl;
			const targetVx = dir * player.maxSpeed;
			const rate =
				(dir !== 0 ? player.acceleration : player.deceleration) *
				control;
			const newVx = approach(vel.x, targetVx, rate * s);
			rb.applyImpulse(
				new Vector2(rb.body.getMass() * (newVx - vel.x), 0),
			);

			const onWall =
				!player.grounded && dir !== 0 && this.touchingWall(rb, dir);
			player.onWall = onWall && player.canWallSlide;
			if (player.grounded || onWall) {
				player.wallJumping = false;
			}

			this.handleJump(input, player, rb, newVx, onWall, dir);
			this.handleWallSlide(player, rb, onWall);
		}
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
		rb.body!.setLinearVelocity({
			x: rb.linearVelocity.x,
			y: player.wallSlideSpeed,
		});
	}

	private touchingWall(
		rb: PhysicsBodyComponent,
		dir: number,
	): boolean {
		const body = rb.body!;
		for (
			let edge = body.getContactList();
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
			const isA = body === contact.getFixtureA().getBody();
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
		rb: PhysicsBodyComponent,
		vx: number,
		onWall: boolean,
		dir: number,
	): void {
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

		const jumpHeld = !!input.keyboard.keys[InputBindings.jump];
		const jumpPressed = jumpHeld && !player.jumpWasHeld;
		player.jumpWasHeld = jumpHeld;

		const wallJump =
			onWall && player.canWallSlide && player.canWallJump;

		if (jumpPressed && (player.jumpsRemaining > 0 || wallJump)) {
			const speed = player.grounded
				? player.maxJumpSpeed
				: player.airJumpSpeed;
			const launchVx = wallJump ? -dir * player.maxSpeed : vx;
			rb.body!.setLinearVelocity({ x: launchVx, y: -speed });
			if (wallJump) {
				player.wallJumping = true;
			} else {
				player.jumpsRemaining -= 1;
			}
			player.jumping = player.grounded;
			return;
		}

		if (!player.jumping) {
			return;
		}

		const vy = rb.linearVelocity.y;
		if (vy >= 0) {
			player.jumping = false;
		} else if (!jumpHeld && vy < -player.minJumpSpeed) {
			rb.body!.setLinearVelocity({ x: vx, y: -player.minJumpSpeed });
			player.jumping = false;
		}
	}
}
