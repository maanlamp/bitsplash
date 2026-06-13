import { RigidbodyComponent } from "../components/rigidbody";
import { TransformComponent } from "../components/transform";
import { type UpdateContext, UpdateSystem } from "../system";

export class PhysicsSystem implements UpdateSystem {
	update({ dt, ecs, world }: UpdateContext): void {
		world.step(dt / 1000);

		for (const [, transform, rb] of ecs.query(
			TransformComponent,
			RigidbodyComponent,
		)) {
			const pos = rb.body.getPosition();
			transform.position.x = pos.x;
			transform.position.y = pos.y;
			transform.rotation.radians = rb.body.getAngle();
		}
	}
}
