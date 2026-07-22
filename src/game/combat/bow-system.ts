import type AssetManager from "../../engine/assets";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import { profiler } from "../../engine/profiling/profiler";
import type { ECS, EntityId } from "../../engine/ecs";
import { SpriteComponent } from "../../engine/sprite/sprite-component";
import { isBspriteUrl } from "../../engine/sprite/sprite-asset-cache";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import Vector2 from "../../engine/vector2";
import { AimComponent } from "../aim/aim-component";
import { ArrowComponent } from "../combat/arrow-component";
import { BowComponent } from "../combat/bow-component";
import { DamageStatsComponent } from "../combat/damage-stats-component";
import { attachmentWorldOffset } from "../combat/grip-offset";
import { NO_MODIFIERS } from "../combat/resolve-hit";
import { spawnPrefab } from "../prefabs";

const SHOT_SPREAD = 0.04;
const FIRE_ACTION = "attack.primary";

/** Attachment point (authored on `player.bsprite`) where the front hand grips the bow. */
const GRIP_ATTACHMENT = "grip";

@profiler("Bow", "Combat")
export class BowSystem implements UpdateSystem {
	update({ ecs, actions, world, assetManager }: UpdateContext): void {
		const firing = actions.active(FIRE_ACTION);

		for (const [id, bow, owner, aimComponent] of ecs.query(
			BowComponent,
			TransformComponent,
			AimComponent,
		)) {
			const stats = ecs.getComponent(id, DamageStatsComponent);
			if (!stats) {
				continue;
			}
			const angle = aimComponent.aim.sample();
			const direction = Vector2.fromAngle(angle);

			const grip = this.gripOffset(ecs, assetManager, id, owner);
			if (grip) {
				bow.renderPosition.set(
					owner.position.x + grip.x,
					owner.position.y + grip.y,
				);
			} else {
				bow.renderPosition
					.copy(owner.position)
					.add(direction.clone().mul(bow.offset));
			}

			const facingLeft = Math.cos(angle) < 0;
			bow.flipX = facingLeft;
			bow.renderAngle = facingLeft ? angle + Math.PI : angle;
			bow.visible = true;

			const ownerIntent = ecs.getComponent(
				id,
				MovementIntentComponent,
			);
			if (ownerIntent) {
				ownerIntent.faceX = facingLeft ? -1 : 1;
			}

			if (firing && !bow.wasFiring) {
				this.fire(
					world,
					bow,
					stats,
					bow.renderPosition,
					direction,
					angle,
				);
			}
			bow.wasFiring = firing;
		}
	}

	/**
	 * The world-space offset from the owner's position to the bow grip, read from
	 * the owner sprite's per-frame `grip` attachment (mirrored to match the
	 * sprite's `flipX`). Returns `undefined` when the owner has no `.bsprite`
	 * sprite, its asset is not loaded yet, or the current frame has no grip point —
	 * the caller then falls back to the radial `bow.offset` placement.
	 */
	private gripOffset(
		ecs: ECS,
		assetManager: AssetManager,
		id: EntityId,
		owner: TransformComponent,
	): Readonly<{ x: number; y: number }> | undefined {
		const sprite = ecs.getComponent(id, SpriteComponent);
		if (!sprite || !isBspriteUrl(sprite.urlRef.path)) {
			return undefined;
		}
		const asset = assetManager.sprites.get(sprite.urlRef.path);
		const point = asset?.attachment(GRIP_ATTACHMENT, sprite.frame);
		if (!asset || !point) {
			return undefined;
		}
		return attachmentWorldOffset(
			point,
			asset.contentRect(sprite.current),
			owner.scale,
			sprite.flipX,
		);
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
