import { expect, test } from "bun:test";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import {
	EdgeDetector,
	parseToken,
	token,
} from "../src/engine/input/edge-detector";
import type { GamepadState } from "../src/engine/input/gamepad";

type SnapshotSpec = {
	keys?: string[];
	mouse?: string[];
	pads?: Record<string, number[]>;
};

const snapshot = (spec: SnapshotSpec): DeviceSnapshot => {
	const keys: Record<string, boolean> = {};
	for (const key of spec.keys ?? []) {
		keys[key] = true;
	}
	const buttons: Record<string, boolean> = {};
	for (const button of spec.mouse ?? []) {
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
			position: { x: 0, y: 0 },
			wheel: { x: 0, y: 0 },
		},
		gamepads,
	};
};

test("token helpers build canonical device-qualified strings", () => {
	expect(token.keyboard("E")).toBe("kbd:E");
	expect(token.mouse("left")).toBe("mouse:left");
	expect(token.gamepad(0, "south")).toBe("pad0:south");
});

test("parseToken inverts the token helpers", () => {
	expect(parseToken("kbd:E")).toEqual({
		device: "kbd",
		pad: null,
		code: "E",
	});
	expect(parseToken("mouse:left")).toEqual({
		device: "mouse",
		pad: null,
		code: "left",
	});
	expect(parseToken("pad0:south")).toEqual({
		device: "pad",
		pad: "0",
		code: "south",
	});
	expect(parseToken("garbage")).toBeNull();
});

test("justPressed fires only on the down edge", () => {
	const edges = new EdgeDetector();
	edges.step(snapshot({}));
	expect(edges.justPressed("kbd:E")).toBe(false);

	edges.step(snapshot({ keys: ["E"] }));
	expect(edges.justPressed("kbd:E")).toBe(true);
	expect(edges.isDown("kbd:E")).toBe(true);

	edges.step(snapshot({ keys: ["E"] }));
	expect(edges.justPressed("kbd:E")).toBe(false);
	expect(edges.isDown("kbd:E")).toBe(true);
});

test("justReleased fires only on the up edge", () => {
	const edges = new EdgeDetector();
	edges.step(snapshot({ keys: ["E"] }));
	expect(edges.justReleased("kbd:E")).toBe(false);

	edges.step(snapshot({}));
	expect(edges.justReleased("kbd:E")).toBe(true);
	expect(edges.isDown("kbd:E")).toBe(false);

	edges.step(snapshot({}));
	expect(edges.justReleased("kbd:E")).toBe(false);
});

test("mouse and gamepad tokens are detected", () => {
	const edges = new EdgeDetector();
	edges.step(snapshot({}));
	edges.step(snapshot({ mouse: ["left"], pads: { "0": [0] } }));
	expect(edges.justPressed("mouse:left")).toBe(true);
	expect(edges.justPressed("pad0:south")).toBe(true);
	expect(edges.isDown("pad0:south")).toBe(true);
});

test("step stores values so live snapshot mutation cannot corrupt prev", () => {
	const edges = new EdgeDetector();
	const keys: Record<string, boolean> = { E: true };
	const live: DeviceSnapshot = {
		keyboard: { keys },
		mouse: {
			buttons: {},
			position: { x: 0, y: 0 },
			wheel: { x: 0, y: 0 },
		},
		gamepads: {},
	};
	edges.step(live);
	keys.E = false;
	edges.step(live);
	expect(edges.justReleased("kbd:E")).toBe(true);
});

test("reset swallows edges on the next step", () => {
	const edges = new EdgeDetector();
	edges.step(snapshot({ keys: ["E"] }));
	edges.reset();

	edges.step(snapshot({ keys: ["E"] }));
	expect(edges.justPressed("kbd:E")).toBe(false);
	expect(edges.isDown("kbd:E")).toBe(true);

	edges.step(snapshot({}));
	expect(edges.justReleased("kbd:E")).toBe(true);
});
