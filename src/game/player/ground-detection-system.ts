import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { PlayerInputComponent } from "../player/player-input-component";

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
