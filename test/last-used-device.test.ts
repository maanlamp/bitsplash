import { expect, test } from "bun:test";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import { LastUsedDevice } from "../src/engine/input/last-used-device";
import Vector2 from "../src/engine/vector2";

const snapshot = (
	over: Partial<{
		keys: Record<string, boolean>;
		buttons: Record<string, boolean>;
		wheel: Vector2;
		gamepads: DeviceSnapshot["gamepads"];
	}> = {},
): DeviceSnapshot => ({
	keyboard: { keys: over.keys ?? {} },
	mouse: {
		buttons: over.buttons ?? {},
		position: new Vector2(0, 0),
		wheel: over.wheel ?? new Vector2(0, 0),
	},
	gamepads: over.gamepads ?? {},
});

const pad = (
	over: Partial<{
		buttons: Record<string, boolean>;
		axes: Record<string, Vector2>;
	}>,
): DeviceSnapshot["gamepads"] => ({
	"0": {
		buttons: over.buttons ?? {},
		axes: over.axes ?? {},
		id: "Test Controller",
		mapping: "standard",
	},
});

test("defaults to mkb", () => {
	expect(new LastUsedDevice().active).toEqual({
		kind: "mkb",
		padSlot: null,
	});
});

test("keyboard and mouse are a single mkb mode", () => {
	const device = new LastUsedDevice();

	device.update(snapshot({ keys: { E: true } }));
	expect(device.active).toEqual({ kind: "mkb", padSlot: null });

	device.update(snapshot({ buttons: { left: true } }));
	expect(device.active).toEqual({ kind: "mkb", padSlot: null });

	device.update(snapshot({ wheel: new Vector2(0, 3) }));
	expect(device.active).toEqual({ kind: "mkb", padSlot: null });
});

test("switches between mkb and gamepad on new activity", () => {
	const device = new LastUsedDevice();

	device.update(snapshot({ keys: { E: true } }));
	expect(device.active.kind).toBe("mkb");

	device.update(
		snapshot({ gamepads: pad({ buttons: { "0": true } }) }),
	);
	expect(device.active).toEqual({ kind: "gamepad", padSlot: "0" });

	device.update(snapshot({ buttons: { left: true } }));
	expect(device.active).toEqual({ kind: "mkb", padSlot: null });
});

test("holds the current device while idle (hysteresis)", () => {
	const device = new LastUsedDevice();
	device.update(
		snapshot({ gamepads: pad({ buttons: { "1": true } }) }),
	);
	expect(device.active.kind).toBe("gamepad");

	device.update(snapshot());
	expect(device.active.kind).toBe("gamepad");
});

test("gamepad axis past the deadzone counts as activity", () => {
	const device = new LastUsedDevice();
	device.update(
		snapshot({
			gamepads: pad({ axes: { "0": new Vector2(0.1, 0.1) } }),
		}),
	);
	expect(device.active.kind).toBe("mkb");

	device.update(
		snapshot({
			gamepads: pad({ axes: { "0": new Vector2(0.9, 0) } }),
		}),
	);
	expect(device.active.kind).toBe("gamepad");
});
