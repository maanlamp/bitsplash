import { pickActiveCamera2D } from "../../engine/camera/camera-2d-render";
import { ActiveDevice } from "../../engine/input/aim/active-device";
import {
	type AimSettingsValues,
	DEFAULT_AIM_SETTINGS,
	readAimSettings,
} from "../../engine/input/aim/aim-settings";
import type { DeviceSnapshot } from "../../engine/input/device-snapshot";
import type { SettingsStore } from "../../engine/input/settings-store";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import Vector2 from "../../engine/vector2";
import { AimComponent } from "./aim-component";

const AIM_STICK_INDEX = "1";

export class AimSystem implements UpdateSystem {
	private readonly device = new ActiveDevice();
	private readonly settings: AimSettingsValues;
	private readonly cursorWorld = new Vector2(0, 0);

	constructor(store?: SettingsStore) {
		this.settings = store
			? readAimSettings(store)
			: DEFAULT_AIM_SETTINGS;
	}

	update({ ecs, input, dt }: UpdateContext): void {
		const dtSeconds = dt / 1000;
		this.device.update(input, dtSeconds);
		const camera = pickActiveCamera2D(ecs);

		for (const [, aimComponent, transform] of ecs.query(
			AimComponent,
			TransformComponent,
		)) {
			if (this.device.aimOwner === "mkb") {
				if (!camera) {
					continue;
				}
				camera.screenToWorld(input.mouse.position, this.cursorWorld);
				aimComponent.aim.setFromPointer(
					transform.position.x,
					transform.position.y,
					this.cursorWorld.x,
					this.cursorWorld.y,
				);
			} else {
				const stick = this.readAimStick(input);
				if (
					stick &&
					Math.hypot(stick.x, stick.y) > this.settings.deadzone
				) {
					aimComponent.aim.seed(Math.atan2(stick.y, stick.x));
				}
			}
		}
	}

	private readAimStick(snapshot: DeviceSnapshot): Vector2 | null {
		for (const pad in snapshot.gamepads) {
			const stick = snapshot.gamepads[pad]!.axes[AIM_STICK_INDEX];
			if (stick) {
				return stick;
			}
		}
		return null;
	}
}
