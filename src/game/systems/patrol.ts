import { RigidbodyComponent } from "../../engine/components/rigidbody";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import Vector2 from "../../engine/vector2";
import { PatrolComponent } from "../components/patrol";

export class PatrolSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		const seconds = dt / 1000;
		for (const [, patrol, rb] of ecs.query(
			PatrolComponent,
			RigidbodyComponent,
		)) {
			patrol.timer -= seconds;
			if (patrol.timer <= 0) {
				patrol.direction = -patrol.direction;
				patrol.timer = patrol.interval;
			}
			rb.linearVelocity = new Vector2(
				patrol.direction * patrol.speed,
				rb.linearVelocity.y,
			);
		}
	}
}
