import Vector2 from "../vector2";

/**
 * Immediate-mode state for a single gamepad. `buttons` is keyed by index string
 * and present only while pressed; `axes` pairs consecutive raw axes into
 * `Vector2` sticks keyed by pair index (`"0"` = axes 0/1, `"1"` = axes 2/3).
 */
export type GamepadState = Readonly<{
	buttons: Record<string, boolean>;
	axes: Record<string, Vector2>;
}>;

/**
 * Polls connected gamepads each frame via the Gamepad API and exposes their
 * state keyed by the slot index. No listeners are needed — disconnected pads
 * simply stop appearing in `navigator.getGamepads()` and drop from the record.
 */
export class Gamepads {
	private current: Record<string, GamepadState> = {};

	get states(): Record<string, GamepadState> {
		return this.current;
	}

	update(): void {
		const next: Record<string, GamepadState> = {};
		for (const pad of navigator.getGamepads()) {
			if (!pad) {
				continue;
			}

			const buttons: Record<string, boolean> = {};
			pad.buttons.forEach((button, i) => {
				if (button.pressed) {
					buttons[String(i)] = true;
				}
			});

			const axes: Record<string, Vector2> = {};
			for (let i = 0; i < pad.axes.length; i += 2) {
				axes[String(i / 2)] = new Vector2(
					pad.axes[i] ?? 0,
					pad.axes[i + 1] ?? 0,
				);
			}

			next[String(pad.index)] = { buttons, axes };
		}
		this.current = next;
	}

	dispose(): void {}
}
