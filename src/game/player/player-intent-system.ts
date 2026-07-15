import { isExclusiveSequenceActive } from "../../engine/sequence/sequence-system";
import type { DeviceSnapshot } from "../../engine/input/device-snapshot";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { ACTION_IDS } from "../input/action-ids";
import { PlayerInputComponent } from "../player/player-input-component";

const MOVE_STICK_INDEX = "0";
const MOVE_STICK_DEADZONE = 0.2;

export class PlayerIntentSystem implements UpdateSystem {
	enabled = true;
	private wasFrozen = false;

	update({ ecs, actions, input }: UpdateContext): void {
		const frozen = isExclusiveSequenceActive(ecs);
		const justFroze = frozen && !this.wasFrozen;
		this.wasFrozen = frozen;
		if (!this.enabled) {
			return;
		}
		const stickX = this.readMoveStick(input);
		for (const [, , intent] of ecs.query(
			PlayerInputComponent,
			MovementIntentComponent,
		)) {
			if (frozen) {
				if (justFroze) {
					intent.clear();
				}
				continue;
			}

			let dir = 0;
			if (actions.active(ACTION_IDS.moveLeft)) {
				dir -= 1;
			}
			if (actions.active(ACTION_IDS.moveRight)) {
				dir += 1;
			}
			intent.moveX = stickX ?? dir;
			intent.jumpHeld = actions.active(ACTION_IDS.jumpHold);
			intent.jumpPressed = actions.fired(ACTION_IDS.jump);
			intent.jumpSpeed = null;
			intent.wantDrop = false;
		}
	}

	private readMoveStick(snapshot: DeviceSnapshot): number | null {
		for (const slot in snapshot.gamepads) {
			const stick = snapshot.gamepads[slot]!.axes[MOVE_STICK_INDEX];
			if (stick && Math.abs(stick.x) > MOVE_STICK_DEADZONE) {
				return stick.x;
			}
		}
		return null;
	}
}
