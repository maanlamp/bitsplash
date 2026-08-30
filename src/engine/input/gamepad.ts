import Vector2 from "../vector2";

/**
 * Immediate-mode state for a single gamepad. `buttons` is keyed by index string
 * and present only while pressed; `axes` pairs consecutive raw axes into
 * `Vector2` sticks keyed by pair index (`"0"` = axes 0/1, `"1"` = axes 2/3).
 */
export type GamepadState = Readonly<{
	buttons: Record<string, boolean>;
	axes: Record<string, Vector2>;
	id: string;
	mapping: string;
}>;

/**
 * Polls connected gamepads each frame via the Gamepad API and exposes their
 * state keyed by the slot index. No listeners are needed — disconnected pads
 * simply stop appearing in `navigator.getGamepads()` and drop from the record.
 */
export const stickScratch = new Vector2(0, 0);

export class Gamepads {
	private current: Record<string, GamepadState> = {};
	private seen = new Set<string>();

	get states(): Record<string, GamepadState> {
		return this.current;
	}

	update(): void {
		this.seen.clear();
		for (const pad of navigator.getGamepads()) {
			if (!pad) {
				continue;
			}
			const key = String(pad.index);
			this.seen.add(key);

			let state = this.current[key];
			if (!state || state.id !== pad.id) {
				state = {
					buttons: {},
					axes: {},
					id: pad.id,
					mapping: pad.mapping,
				};
				this.current[key] = state;
			}

			const buttons = state.buttons;
			for (const held of Object.keys(buttons)) {
				delete buttons[held];
			}
			pad.buttons.forEach((button, i) => {
				if (button.pressed) {
					buttons[String(i)] = true;
				}
			});

			const axes = state.axes;
			for (let i = 0; i < pad.axes.length; i += 2) {
				const pair = String(i / 2);
				const vec = (axes[pair] ??= new Vector2(0, 0));
				vec.set(pad.axes[i] ?? 0, pad.axes[i + 1] ?? 0);
			}
		}

		for (const key of Object.keys(this.current)) {
			if (!this.seen.has(key)) {
				delete this.current[key];
			}
		}
	}

	dispose(): void {}
}
