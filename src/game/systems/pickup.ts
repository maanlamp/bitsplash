import { PhysicsBodyComponent } from "../../engine/components/physics-body";
import { TransformComponent } from "../../engine/components/transform";
import { CollisionEvent } from "../../engine/events";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tile";
import Vector2 from "../../engine/vector2";
import {
	PickupComponent,
	type PickupType,
} from "../components/pickup";
import { PlayerInputComponent } from "../components/player-input";
import {
	PICKUP_MAGNET_MAX_SPEED,
	PICKUP_MAGNET_MIN_SPEED,
	PICKUP_MAGNET_RADIUS,
	PICKUP_RADIUS,
} from "../constants";

export class PickupSystem implements UpdateSystem {
	applyPickup(type: PickupType, player: PlayerInputComponent): void {
		switch (type) {
			case "extra-jump":
				player.maxJumps += 1;
				break;
			case "wall-slide":
				player.canWallSlide = true;
				break;
			case "wall-jump":
				player.canWallJump = true;
				break;
			case "speed-up":
				player.maxSpeed += 0.5 * TILE_SIZE;
				break;
		}
	}

	update({ ecs, world, events }: UpdateContext): void {
		const player = ecs.query(
			PlayerInputComponent,
			TransformComponent,
		)[0];
		if (!player) {
			return;
		}
		const [playerId, playerInput, playerTransform] = player;
		const target = playerTransform.position;

		for (const [id, pickup, transform, rigidBody] of ecs.query(
			PickupComponent,
			TransformComponent,
			PhysicsBodyComponent,
		)) {
			const dist = transform.position.distanceTo(target);

			if (dist <= PICKUP_RADIUS) {
				this.applyPickup(pickup.type, playerInput);
				world.despawn(id);
				events.emit(new CollisionEvent(playerId, id));
				continue;
			}

			if (dist <= PICKUP_MAGNET_RADIUS && rigidBody.body) {
				const t = 1 - dist / PICKUP_MAGNET_RADIUS;
				const speed =
					PICKUP_MAGNET_MIN_SPEED +
					t * (PICKUP_MAGNET_MAX_SPEED - PICKUP_MAGNET_MIN_SPEED);
				const dir = target
					.clone()
					.sub(transform.position)
					.normalize();
				rigidBody.linearVelocity = new Vector2(
					dir.x * speed,
					dir.y * speed,
				);
			}
		}
	}
}
