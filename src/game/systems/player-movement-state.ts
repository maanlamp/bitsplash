import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { PlayerInputComponent } from "../components/player-input";
import { PlayerMovementStateComponent } from "../components/player-movement-state";

export class PlayerMovementStateSystem implements UpdateSystem {
	update({ ecs }: UpdateContext): void {
		for (const [id, input] of ecs.query(PlayerInputComponent)) {
			if (ecs.getComponent(id, PlayerMovementStateComponent)) {
				continue;
			}
			ecs.addComponent(
				id,
				new PlayerMovementStateComponent(input.maxJumps),
			);
		}
	}
}
