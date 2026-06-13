import { RigidbodyComponent } from "../../engine/components/rigidbody";
import type { EntityId } from "../../engine/ecs";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import Vector2 from "../../engine/vector2";
import { PatrolComponent } from "../components/patrol";

export class PatrolSystem implements UpdateSystem {
	private timers = new Map<EntityId, number>();

	update({ dt, ecs }: UpdateContext): void {
		const seconds = dt / 1000;
		const active = new Set<EntityId>();

		for (const [id, patrol, rb] of ecs.query(
			PatrolComponent,
			RigidbodyComponent,
		)) {
			active.add(id);
			let timer = this.timers.get(id) ?? patrol.interval;
			timer -= seconds;
			if (timer <= 0) {
				patrol.direction = -patrol.direction;
				timer = patrol.interval;
			}
			this.timers.set(id, timer);
			rb.linearVelocity = new Vector2(
				patrol.direction * patrol.speed,
				rb.linearVelocity.y,
			);
		}

		// TODO: Maybe this should be generic to the ECS.
		// We need to clean up timers that reference deleted entities.
		// We track existing entities locally for now.
		for (const id of this.timers.keys()) {
			if (!active.has(id)) {
				this.timers.delete(id);
			}
		}
	}
}
