import { DialogueComponent } from "../../engine/components/dialogue";
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
	PICKUP_TYPES,
	PickupComponent,
	type PickupType,
} from "../components/pickup";
import { PlayerInputComponent } from "../components/player-input";
import {
	PICKUP_MAGNET_MAX_SPEED,
	PICKUP_MAGNET_MIN_SPEED,
	PICKUP_MAGNET_RADIUS,
} from "../constants";
import { PickupCollectedEvent, QuestRewardEvent } from "../events";

const isPickupType = (value: string): value is PickupType =>
	(PICKUP_TYPES as readonly string[]).includes(value);

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

		for (const event of events.read(QuestRewardEvent)) {
			const ability = event.reward.ability;
			if (
				event.reward.type === "ability" &&
				typeof ability === "string" &&
				isPickupType(ability)
			) {
				this.applyPickup(ability, playerInput);
			}
		}

		if (ecs.query(DialogueComponent)[0]) {
			return;
		}

		for (const event of events.read(CollisionEvent)) {
			const other =
				event.a === playerId
					? event.b
					: event.b === playerId
						? event.a
						: null;
			if (other === null) {
				continue;
			}
			const pickup = ecs.getComponent(other, PickupComponent);
			if (pickup) {
				this.applyPickup(pickup.type, playerInput);
				events.emit(new PickupCollectedEvent(other, pickup.type));
				world.scheduleDespawn(other);
			}
		}

		const target = playerTransform.position;
		for (const [, , transform, rigidBody] of ecs.query(
			PickupComponent,
			TransformComponent,
			PhysicsBodyComponent,
		)) {
			if (!rigidBody.body) {
				continue;
			}
			const dist = transform.position.distanceTo(target);
			if (dist <= 0 || dist > PICKUP_MAGNET_RADIUS) {
				continue;
			}
			const t = 1 - dist / PICKUP_MAGNET_RADIUS;
			const speed =
				PICKUP_MAGNET_MIN_SPEED +
				t * (PICKUP_MAGNET_MAX_SPEED - PICKUP_MAGNET_MIN_SPEED);
			const dir = target.clone().sub(transform.position).normalize();
			const vel = rigidBody.linearVelocity;
			const mass = rigidBody.body.mass;
			rigidBody.applyImpulse(
				new Vector2(
					mass * (dir.x * speed - vel.x),
					mass * (dir.y * speed - vel.y),
				),
			);
		}
	}
}
