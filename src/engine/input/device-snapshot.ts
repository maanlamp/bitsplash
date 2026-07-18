import type { ReadonlyVector2 } from "../vector2";
import type { GamepadState } from "./gamepad";

export interface DeviceSnapshot {
	readonly keyboard: Readonly<{
		keys: Readonly<Record<string, boolean>>;
	}>;
	readonly mouse: Readonly<{
		buttons: Readonly<Record<string, boolean>>;
		position: ReadonlyVector2;
		wheel: ReadonlyVector2;
		inside?: boolean;
		modifiers?: Readonly<{
			ctrl: boolean;
			shift: boolean;
			alt: boolean;
			meta: boolean;
		}>;
	}>;
	readonly gamepads: Readonly<Record<string, GamepadState>>;
}
