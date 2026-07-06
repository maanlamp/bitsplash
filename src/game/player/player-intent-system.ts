import { isCutsceneActive } from "../../engine/cutscene/cutscene-system";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { InputBindings } from "../input-bindings";
import { PlayerInputComponent } from "../player/player-input-component";

export class PlayerIntentSystem implements UpdateSystem {
	enabled = true;
	private wasFrozen = false;

	update({ ecs, input }: UpdateContext): void {
		const frozen = isCutsceneActive(ecs);
		const justFroze = frozen && !this.wasFrozen;
		this.wasFrozen = frozen;
		if (!this.enabled) {
			return;
		}
		for (const [, player, intent] of ecs.query(
			PlayerInputComponent,
			MovementIntentComponent,
		)) {
			const jumpHeldRaw = !!input.keyboard.keys[InputBindings.jump];
			if (frozen) {
				player.jumpWasHeld = jumpHeldRaw;
				if (justFroze) {
					intent.clear();
				}
				continue;
			}

			let dir = 0;
			if (input.keyboard.keys[InputBindings.left]) {
				dir -= 1;
			}
			if (input.keyboard.keys[InputBindings.right]) {
				dir += 1;
			}
			intent.moveX = dir;
			intent.jumpHeld = jumpHeldRaw;
			intent.jumpPressed = jumpHeldRaw && !player.jumpWasHeld;
			intent.jumpSpeed = null;
			intent.wantDrop = false;
			player.jumpWasHeld = jumpHeldRaw;
		}
	}
}
