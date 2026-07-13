import { expect, test } from "bun:test";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import type { GamepadState } from "../src/engine/input/gamepad";
import { maskedInput } from "../src/engine/ui/input/masked-input";

type SnapshotSpec = {
	keys?: string[];
	buttons?: string[];
	wheel?: [number, number];
	pads?: Record<string, number[]>;
};

const snapshot = (spec: SnapshotSpec): DeviceSnapshot => {
	const keys: Record<string, boolean> = {};
	for (const key of spec.keys ?? []) {
		keys[key] = true;
	}
	const buttons: Record<string, boolean> = {};
	for (const button of spec.buttons ?? []) {
		buttons[button] = true;
	}
	const gamepads: Record<string, GamepadState> = {};
	for (const pad in spec.pads ?? {}) {
		const pressed: Record<string, boolean> = {};
		for (const index of spec.pads![pad]!) {
			pressed[String(index)] = true;
		}
		gamepads[pad] = {
			buttons: pressed,
			axes: {},
			id: "",
			mapping: "standard",
		};
	}
	return {
		keyboard: { keys },
		mouse: {
			buttons,
			position: { x: 3, y: 4 },
			wheel: {
				x: spec.wheel ? spec.wheel[0] : 0,
				y: spec.wheel ? spec.wheel[1] : 0,
			},
		},
		gamepads,
	};
};

test("empty consumed set returns the source untouched", () => {
	const source = snapshot({ keys: ["W"], buttons: ["left"] });
	expect(maskedInput(source, new Set())).toBe(source);
});

test("a consumed pointer button is suppressed while movement keys pass through", () => {
	const source = snapshot({
		keys: ["W", "A"],
		buttons: ["left", "right"],
	});
	const masked = maskedInput(source, new Set(["mouse:left"]));
	expect(masked.mouse.buttons.left).toBeUndefined();
	expect(masked.mouse.buttons.right).toBe(true);
	expect(masked.keyboard.keys.W).toBe(true);
	expect(masked.keyboard.keys.A).toBe(true);
});

test("a consumed key falls out while other keys remain", () => {
	const source = snapshot({ keys: ["ARROWLEFT", "W"] });
	const masked = maskedInput(source, new Set(["kbd:ARROWLEFT"]));
	expect(masked.keyboard.keys.ARROWLEFT).toBeUndefined();
	expect(masked.keyboard.keys.W).toBe(true);
});

test("the wheel token zeroes the wheel delta", () => {
	const source = snapshot({ wheel: [0, 5] });
	const masked = maskedInput(source, new Set(["mouse:wheel"]));
	expect(masked.mouse.wheel.x).toBe(0);
	expect(masked.mouse.wheel.y).toBe(0);
});

test("a consumed gamepad button is suppressed by name-to-index mapping", () => {
	const source = snapshot({ pads: { "0": [0, 1] } });
	const masked = maskedInput(source, new Set(["pad0:south"]));
	expect(masked.gamepads["0"]!.buttons["0"]).toBeUndefined();
	expect(masked.gamepads["0"]!.buttons["1"]).toBe(true);
});

test("modal produces a full mask that suppresses everything", () => {
	const source = snapshot({
		keys: ["W"],
		buttons: ["left"],
		wheel: [1, 1],
		pads: { "0": [0] },
	});
	const masked = maskedInput(source, new Set(), true);
	expect(Object.keys(masked.keyboard.keys)).toHaveLength(0);
	expect(Object.keys(masked.mouse.buttons)).toHaveLength(0);
	expect(masked.mouse.wheel.x).toBe(0);
	expect(masked.mouse.wheel.y).toBe(0);
	expect(Object.keys(masked.gamepads["0"]!.buttons)).toHaveLength(0);
	expect(masked.mouse.position.x).toBe(3);
});
