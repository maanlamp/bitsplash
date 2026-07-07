import { computeGrounded } from "../physics/grounded";
import { PhysicsBodyComponent } from "../physics/physics-body-component";
import { type UpdateContext, UpdateSystem } from "../system";
import Vector2 from "../vector2";
import { LocomotionComponent } from "./locomotion-component";
import { MovementIntentComponent } from "./movement-intent-component";

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

export class LocomotionSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		const s = dt / 1000;
		for (const [, intent, loco, rb] of ecs.query(
			MovementIntentComponent,
			LocomotionComponent,
			PhysicsBodyComponent,
		)) {
			if (!rb.body) {
				continue;
			}
			loco.grounded = computeGrounded(rb.body);

			const vel = rb.linearVelocity;
			const control = loco.grounded ? 1 : loco.airControl.value;
			const targetVx = intent.moveX * loco.maxSpeed;
			const rate =
				(intent.moveX !== 0 ? loco.acceleration : loco.deceleration) *
				control;
			const newVx = approach(vel.x, targetVx, rate * s);
			rb.applyImpulse(new Vector2(rb.body.mass * (newVx - vel.x), 0));

			if (intent.jumpPressed && loco.grounded) {
				const speed = intent.jumpSpeed ?? loco.jumpSpeed;
				rb.body.linearVelocity = { x: newVx, y: -speed };
			}
		}
	}
}
