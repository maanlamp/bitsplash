import { computeGrounded } from "../../engine/physics/grounded";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { profiler } from "../../engine/profiling/profiler";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { PlayerInputComponent } from "../player/player-input-component";

@profiler("Ground detection", "Movement")
export class GroundDetectionSystem implements UpdateSystem {
	update({ ecs }: UpdateContext): void {
		for (const [, player, rb] of ecs.query(
			PlayerInputComponent,
			PhysicsBodyComponent,
		)) {
			if (!rb.body) {
				continue;
			}
			player.grounded = computeGrounded(rb.body);
		}
	}
}
