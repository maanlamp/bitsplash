import { RigidbodyComponent } from "../../engine/components/rigidbody";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { PlayerInputComponent } from "../components/player-input";

export class GroundDetectionSystem implements UpdateSystem {
	update({ ecs }: UpdateContext): void {
		for (const [, player, rb] of ecs.query(
			PlayerInputComponent,
			RigidbodyComponent,
		)) {
			let grounded = false;
			for (
				let edge = rb.body.getContactList();
				edge;
				edge = edge.next ?? null
			) {
				const contact = edge.contact;
				if (!contact.isTouching()) {
					continue;
				}
				const worldManifold = contact.getWorldManifold(null);
				if (!worldManifold) {
					continue;
				}
				const normal = worldManifold.normal;
				const isA = rb.body === contact.getFixtureA().getBody();
				if (isA ? normal.y > 0.5 : normal.y < -0.5) {
					grounded = true;
					break;
				}
			}
			player.grounded = grounded;
		}
	}
}
