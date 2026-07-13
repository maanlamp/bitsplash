import type { DeviceSnapshot } from "./device-snapshot";

export type DeviceKind = "mkb" | "gamepad";

export type ActiveInputDevice = Readonly<{
	kind: DeviceKind;
	padSlot: string | null;
}>;

const AXIS_DEADZONE = 0.5;
const MOUSE_MOVE_THRESHOLD = 2;

const hasKeyboardActivity = (snapshot: DeviceSnapshot): boolean => {
	for (const key in snapshot.keyboard.keys) {
		if (snapshot.keyboard.keys[key]) {
			return true;
		}
	}
	return false;
};

const hasMouseActivity = (snapshot: DeviceSnapshot): boolean => {
	for (const button in snapshot.mouse.buttons) {
		if (snapshot.mouse.buttons[button]) {
			return true;
		}
	}
	const wheel = snapshot.mouse.wheel;
	return wheel.x !== 0 || wheel.y !== 0;
};

const activeGamepadSlot = (
	snapshot: DeviceSnapshot,
): string | null => {
	for (const slot in snapshot.gamepads) {
		const pad = snapshot.gamepads[slot]!;
		for (const index in pad.buttons) {
			if (pad.buttons[index]) {
				return slot;
			}
		}
		for (const pair in pad.axes) {
			const axis = pad.axes[pair]!;
			if (Math.hypot(axis.x, axis.y) > AXIS_DEADZONE) {
				return slot;
			}
		}
	}
	return null;
};

export class LastUsedDevice {
	private current: ActiveInputDevice = {
		kind: "mkb",
		padSlot: null,
	};
	private prevMouseX = 0;
	private prevMouseY = 0;
	private hasPrevMouse = false;

	get active(): ActiveInputDevice {
		return this.current;
	}

	update(snapshot: DeviceSnapshot): void {
		const moved = this.trackMouse(snapshot);
		const slot = activeGamepadSlot(snapshot);
		if (slot !== null) {
			if (
				this.current.kind !== "gamepad" ||
				this.current.padSlot !== slot
			) {
				this.current = { kind: "gamepad", padSlot: slot };
			}
			return;
		}
		if (
			moved ||
			hasMouseActivity(snapshot) ||
			hasKeyboardActivity(snapshot)
		) {
			if (this.current.kind !== "mkb") {
				this.current = { kind: "mkb", padSlot: null };
			}
		}
	}

	private trackMouse(snapshot: DeviceSnapshot): boolean {
		const position = snapshot.mouse.position;
		let moved = false;
		if (this.hasPrevMouse) {
			moved =
				Math.hypot(
					position.x - this.prevMouseX,
					position.y - this.prevMouseY,
				) >= MOUSE_MOVE_THRESHOLD;
		}
		this.prevMouseX = position.x;
		this.prevMouseY = position.y;
		this.hasPrevMouse = true;
		return moved;
	}
}
