import { pickActiveCamera2D } from "../../engine/camera/camera-2d-render";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import { SpriteComponent } from "../../engine/sprite/sprite-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import Vector2 from "../../engine/vector2";
import { ArrowComponent } from "../combat/arrow-component";
import { BowComponent } from "../combat/bow-component";
import { DamageStatsComponent } from "../combat/damage-stats-component";
import { NO_MODIFIERS } from "../combat/resolve-hit";
import { spawnPrefab } from "../prefabs";

const SHOT_SPREAD = 0.04;

export class BowSystem implements UpdateSystem {
	update({ ecs, input, world }: UpdateContext): void {
		const camera = pickActiveCamera2D(ecs);
		if (!camera) {
			return;
		}
		const mouseWorld = camera.screenToWorld(input.mouse.position);

		for (const [id, bow, transform, sprite] of ecs.query(
			BowComponent,
			TransformComponent,
			SpriteComponent,
		)) {
			const owner = ecs.getComponent(bow.owner, TransformComponent);
			if (!owner) {
				continue;
			}
			const stats = ecs.getComponent(id, DamageStatsComponent);
			if (!stats) {
				continue;
			}
			const angle = mouseWorld.clone().sub(owner.position).angle();
			const direction = Vector2.fromAngle(angle);

			transform.position
				.copy(owner.position)
				.add(direction.clone().mul(bow.offset));

			const facingLeft = Math.cos(angle) < 0;
			sprite.flipX = facingLeft;
			transform.rotation.radians = facingLeft
				? angle + Math.PI
				: angle;

			const ownerIntent = ecs.getComponent(
				bow.owner,
				MovementIntentComponent,
			);
			if (ownerIntent) {
				ownerIntent.faceX = facingLeft ? -1 : 1;
			}

			const firing = !!input.mouse.buttons.left;
			if (firing && !bow.wasFiring) {
				this.fire(
					world,
					bow,
					stats,
					transform.position,
					direction,
					angle,
				);
			}
			bow.wasFiring = firing;
		}
	}

	private fire(
		world: UpdateContext["world"],
		bow: BowComponent,
		stats: DamageStatsComponent,
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
			transform.rotation.radians = shotAngle;
		}
		if (arrow) {
			arrow.aimAngle.radians = shotAngle;
			// Snapshot the roll inputs at fire time; the crit roll itself
			// happens at impact (§10.2). The arrow is self-contained so a
			// buff expiring mid-flight cannot retroactively weaken it.
			arrow.base = stats.base;
			arrow.critChance.set(stats.critChance.value);
			arrow.critMultiplier = stats.critMultiplier;
			arrow.flavourSet = stats.flavourSet;
			arrow.mods = NO_MODIFIERS;
			arrow.speed = bow.arrowSpeed;
		}
	}
}
