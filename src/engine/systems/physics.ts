import { PhysicsBodyComponent } from "../components/physics-body";
import { TransformComponent } from "../components/transform";
import { type UpdateContext, UpdateSystem } from "../system";

export class PhysicsSystem implements UpdateSystem {
	update({ dt, ecs, world }: UpdateContext): void {
		for (const [id, phys, transform] of ecs.query(
			PhysicsBodyComponent,
			TransformComponent,
		)) {
			if (phys.body) {
				continue;
			}
			phys.body = world.createBody({
				type: phys.type,
				position: transform.position,
				fixedRotation: phys.fixedRotation,
				bullet: phys.bullet,
				linearDamping: phys.linearDamping,
				box: {
					halfWidth: phys.halfWidth,
					halfHeight: phys.halfHeight,
					offsetX: phys.offsetX,
					offsetY: phys.offsetY,
					cornerRadius: phys.cornerRadius,
				},
				density: phys.density,
				friction: phys.friction,
				restitution: phys.restitution,
				collisionLayer: phys.collisionLayer,
				sensor: phys.sensor,
			});
			phys.body.userData = id;
		}

		world.step(dt / 1000);

		for (const [, transform, phys] of ecs.query(
			TransformComponent,
			PhysicsBodyComponent,
		)) {
			if (!phys.body) {
				continue;
			}
			const alpha = world.interpolationAlpha;
			const pos = phys.body.interpolatedPosition(alpha);
			transform.position.x = pos.x;
			transform.position.y = pos.y;
			transform.rotation.radians = phys.body.interpolatedAngle(alpha);
		}
	}
}
