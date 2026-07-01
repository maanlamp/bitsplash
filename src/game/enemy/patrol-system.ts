import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { StateMachineComponent } from "../../engine/fsm/state-machine-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import Vector2 from "../../engine/vector2";
import { PatrolComponent } from "../enemy/patrol-component";

export class PatrolSystem implements UpdateSystem {
	update({ ecs }: UpdateContext): void {
		for (const [, patrol, rb, sm] of ecs.query(
			PatrolComponent,
			PhysicsBodyComponent,
			StateMachineComponent,
		)) {
			if (!rb.body) {
				continue;
			}
			sm.params.elapsed = sm.elapsed;
			sm.params.interval = patrol.interval;

			const direction = sm.current === "right" ? 1 : -1;
			rb.linearVelocity = new Vector2(
				direction * patrol.speed,
				rb.linearVelocity.y,
			);
		}
	}
}
