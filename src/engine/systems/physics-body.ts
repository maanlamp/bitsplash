import { PhysicsBodyComponent } from "../components/physics-body";
import { RigidbodyComponent } from "../components/rigidbody";
import { TransformComponent } from "../components/transform";
import { type UpdateContext, UpdateSystem } from "../system";

type Properties<T extends object> = {
	[K in keyof T]: T[K];
};

export class PhysicsBodySystem implements UpdateSystem {
	update({ ecs, world }: UpdateContext): void {
		for (const [id, body, transform] of ecs.query(
			PhysicsBodyComponent,
			TransformComponent,
		)) {
			if (ecs.getComponent(id, RigidbodyComponent)) {
				continue;
			}
			const rigidbody = world.createRigidbody({
				...(body as Properties<typeof body>),
				position: transform.position,
				box: {
					halfWidth: body.halfWidth,
					halfHeight: body.halfHeight,
					offsetX: body.offsetX,
					offsetY: body.offsetY,
				},
			});
			rigidbody.body.setUserData(id);
			ecs.addComponent(id, rigidbody);
		}
	}
}
