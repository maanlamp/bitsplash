import { expect, test } from "bun:test";
import { ActiveDevice } from "../src/engine/input/aim/active-device";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import type { GamepadState } from "../src/engine/input/gamepad";
import Vector2 from "../src/engine/vector2";

type SnapshotSpec = {
	keys?: string[];
	mouseButtons?: string[];
	mouse?: { x: number; y: number };
	wheel?: { x: number; y: number };
	pads?: Record<string, number[]>;
	sticks?: Record<string, Record<string, [number, number]>>;
};

const booleanRecord = (list: string[]): Record<string, boolean> => {
	const record: Record<string, boolean> = {};
	for (const item of list) {
		record[item] = true;
	}
	return record;
};

const snapshot = (spec: SnapshotSpec): DeviceSnapshot => {
	const gamepads: Record<string, GamepadState> = {};
	const padKeys = new Set<string>([
		...Object.keys(spec.pads ?? {}),
		...Object.keys(spec.sticks ?? {}),
	]);
	for (const pad of padKeys) {
		const buttons: Record<string, boolean> = {};
		for (const index of spec.pads?.[pad] ?? []) {
			buttons[String(index)] = true;
		}
		const axes: Record<string, Vector2> = {};
		const stickSpec = spec.sticks?.[pad] ?? {};
		for (const pair in stickSpec) {
			const [x, y] = stickSpec[pair]!;
			axes[pair] = new Vector2(x, y);
		}
		gamepads[pad] = { buttons, axes, id: "", mapping: "standard" };
	}
	return {
		keyboard: { keys: booleanRecord(spec.keys ?? []) },
		mouse: {
			buttons: booleanRecord(spec.mouseButtons ?? []),
			position: spec.mouse ?? { x: 0, y: 0 },
			wheel: spec.wheel ?? { x: 0, y: 0 },
		},
		gamepads,
	};
};

const DT = 0.1;

test("promptDevice flips to the gamepad on a button press", () => {
	const device = new ActiveDevice("mkb");
	device.update(snapshot({}), DT);
	expect(device.promptDevice).toBe("mkb");

	device.update(snapshot({ pads: { "0": [0] } }), DT);
	expect(device.promptDevice).toBe("gamepad");
});

test("aim stick steals aimOwner only after sustained deflection", () => {
	const device = new ActiveDevice("mkb");
	device.update(snapshot({}), DT);

	device.update(snapshot({ sticks: { "0": { "1": [1, 0] } } }), DT);
	expect(device.aimOwner).toBe("mkb");

	device.update(snapshot({ sticks: { "0": { "1": [1, 0] } } }), DT);
	expect(device.aimOwner).toBe("gamepad");
});

test("resting stick drift below switch-deadzone never steals aim", () => {
	const device = new ActiveDevice("mkb");
	device.update(snapshot({}), DT);
	for (let i = 0; i < 10; i += 1) {
		device.update(
			snapshot({ sticks: { "0": { "1": [0.2, 0] } } }),
			DT,
		);
	}
	expect(device.aimOwner).toBe("mkb");
});

test("a single mouse bump does not steal aim from the stick", () => {
	const device = new ActiveDevice("mkb");
	device.update(snapshot({}), DT);
	device.update(snapshot({ sticks: { "0": { "1": [1, 0] } } }), DT);
	device.update(snapshot({ sticks: { "0": { "1": [1, 0] } } }), DT);
	expect(device.aimOwner).toBe("gamepad");

	device.update(snapshot({ mouse: { x: 100, y: 0 } }), DT);
	device.update(snapshot({ mouse: { x: 100, y: 0 } }), DT);
	expect(device.aimOwner).toBe("gamepad");
});

test("kbd-move + stick-aim: WASD flips glyphs but never yanks aimOwner", () => {
	const device = new ActiveDevice("mkb");
	device.update(snapshot({}), DT);
	device.update(snapshot({ sticks: { "0": { "1": [1, 0] } } }), DT);
	device.update(snapshot({ sticks: { "0": { "1": [1, 0] } } }), DT);
	expect(device.aimOwner).toBe("gamepad");
	expect(device.promptDevice).toBe("gamepad");

	for (let i = 0; i < 5; i += 1) {
		device.update(snapshot({ keys: ["A"] }), DT);
	}
	expect(device.promptDevice).toBe("mkb");
	expect(device.aimOwner).toBe("gamepad");
});

test("sustained mouse movement steals aimOwner back to mkb", () => {
	const device = new ActiveDevice("gamepad");
	device.update(snapshot({}), DT);

	let x = 0;
	for (let i = 0; i < 5; i += 1) {
		x += 30;
		device.update(snapshot({ mouse: { x, y: 0 } }), DT);
	}
	expect(device.aimOwner).toBe("mkb");
	expect(device.promptDevice).toBe("mkb");
});

test("reset clears mouse baseline and steal charges without changing owners", () => {
	const device = new ActiveDevice("gamepad");
	device.update(snapshot({ mouse: { x: 0, y: 0 } }), DT);
	device.reset();
	device.update(snapshot({ mouse: { x: 1000, y: 0 } }), DT);
	expect(device.aimOwner).toBe("gamepad");
});
