import { type GamepadState, Gamepads } from "./gamepad";
import { Keyboard } from "./keyboard";
import { Mouse } from "./mouse";

/**
 * Engine-owned input: wires every DOM listener and exposes immediate-mode
 * keyboard, mouse, and gamepad state for the game loop to poll. Consumers read
 * the device state each frame; `update` must be ticked once per frame (it rolls
 * the per-frame wheel delta and polls gamepads).
 */
export class Input {
	readonly keyboard: Keyboard;
	readonly mouse: Mouse;

	private pads = new Gamepads();

	constructor(target: HTMLElement) {
		this.keyboard = new Keyboard(target);
		this.mouse = new Mouse(target);
	}

	get gamepads(): Record<string, GamepadState> {
		return this.pads.states;
	}

	update(): void {
		this.mouse.update();
		this.pads.update();
	}

	dispose(): void {
		this.keyboard.dispose();
		this.mouse.dispose();
		this.pads.dispose();
	}
}
