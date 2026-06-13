import { SpriteComponent } from "../../engine/components/sprite";
import { TransformComponent } from "../../engine/components/transform";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { pickActiveCamera2D } from "../../engine/systems/camera-2d";
import Vector2 from "../../engine/vector2";
import { ArrowComponent } from "../components/arrow";
import { BowComponent } from "../components/bow";
import { spawnPrefab } from "../prefabs";

const SHOT_SPREAD = 0.04;

export class BowSystem implements UpdateSystem {
	update({ ecs, input, world }: UpdateContext): void {
		const camera = pickActiveCamera2D(ecs);
		if (!camera) {
			return;
		}
		const mouseWorld = camera.screenToWorld(input.mouse.position);

		for (const [, bow, transform, sprite] of ecs.query(
			BowComponent,
			TransformComponent,
			SpriteComponent,
		)) {
			const owner = ecs.getComponent(bow.owner, TransformComponent);
			if (!owner) {
				continue;
			}
			const angle = mouseWorld.clone().sub(owner.position).angle();
			const direction = Vector2.fromAngle(angle);

			transform.position
				.copy(owner.position)
				.add(direction.clone().mul(bow.offset));

			const facingLeft = Math.cos(angle) < 0;
			sprite.flipX = facingLeft;
			transform.rotation.radians = ( facingLeft ? angle + Math.PI : angle);

			const firing = !!input.mouse.buttons.left;
			if (firing && !bow.wasFiring) {
				this.fire(world, bow, transform.position, direction, angle);
			}
			bow.wasFiring = firing;
		}
	}

	private fire(
		world: UpdateContext["world"],
		bow: BowComponent,
		bowPosition: Vector2,
		direction: Vector2,
		angle: number,
	): void {
		const spawnPosition = bowPosition
			.clone()
			.add(direction.clone().mul(bow.spawnDistance));
		const arrowId = spawnPrefab(world, "arrow", spawnPosition);
		if (arrowId === null) {
			return;
		}
		const transform = world.ecs.getComponent(
			arrowId,
			TransformComponent,
		);
		const arrow = world.ecs.getComponent(arrowId, ArrowComponent);
		const shotAngle = angle + (Math.random() * 2 - 1) * SHOT_SPREAD;
		if (transform) {
			transform.rotation.radians = (shotAngle);
		}
		if (arrow) {
			arrow.aimAngle = shotAngle;
			arrow.damage = bow.damage;
			arrow.speed = bow.arrowSpeed;
		}
	}
}
