import { PhysicsBodyComponent } from "../../engine/components/physics-body";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { PlayerInputComponent } from "../components/player-input";

export class GroundDetectionSystem implements UpdateSystem {
	update({ ecs }: UpdateContext): void {
		for (const [, player, rb] of ecs.query(
			PlayerInputComponent,
			PhysicsBodyComponent,
		)) {
			if (!rb.body) {
				continue;
			}
			let grounded = false;
			for (const { normal } of rb.body.touchingContacts()) {
				if (normal.y > 0.5) {
					grounded = true;
					break;
				}
			}
			player.grounded = grounded;
		}
	}
}
