import { expect, test } from "bun:test";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import type { GamepadState } from "../src/engine/input/gamepad";
import Vector2 from "../src/engine/vector2";
import { InputNormalizer } from "../src/engine/ui/input/input-normalizer";
import { UiEventQueue } from "../src/engine/ui/input/ui-event-queue";
import type { FocusDirection } from "../src/engine/ui/input/ui-event";

type PadSpec = { buttons?: number[]; stick?: [number, number] };

const snapshot = (pad?: PadSpec): DeviceSnapshot => {
	const gamepads: Record<string, GamepadState> = {};
	if (pad) {
		const buttons: Record<string, boolean> = {};
		for (const index of pad.buttons ?? []) {
			buttons[String(index)] = true;
		}
		const axes: Record<string, Vector2> = {};
		if (pad.stick) {
			axes["0"] = new Vector2(pad.stick[0], pad.stick[1]);
		}
		gamepads["0"] = { buttons, axes, id: "", mapping: "standard" };
	}
	return {
		keyboard: { keys: {} },
		mouse: {
			buttons: {},
			position: { x: 0, y: 0 },
			wheel: { x: 0, y: 0 },
		},
		gamepads,
	};
};

const moves = (queue: UiEventQueue): FocusDirection[] => {
	const out: FocusDirection[] = [];
	for (const entry of queue.entries) {
		if (entry.event.type === "focusmove") {
			out.push(entry.event.direction);
		}
	}
	return out;
};

test("held dpad emits an initial move, pauses, then auto-repeats", () => {
	const normalizer = new InputNormalizer();
	const dt = 0.1;
	const held = snapshot({ buttons: [13] });

	const q1 = new UiEventQueue();
	normalizer.sample(held, q1, 1, dt);
	expect(moves(q1)).toEqual(["down"]);

	const q2 = new UiEventQueue();
	normalizer.sample(held, q2, 1, dt);
	expect(moves(q2)).toEqual([]);

	const q3 = new UiEventQueue();
	normalizer.sample(held, q3, 1, dt);
	expect(moves(q3)).toEqual([]);

	const q4 = new UiEventQueue();
	normalizer.sample(held, q4, 1, dt);
	expect(moves(q4)).toEqual(["down"]);
});

test("releasing the direction resets the repeat timer", () => {
	const normalizer = new InputNormalizer();
	const dt = 0.1;
	const held = snapshot({ buttons: [13] });

	const q1 = new UiEventQueue();
	normalizer.sample(held, q1, 1, dt);
	expect(moves(q1)).toEqual(["down"]);

	const released = new UiEventQueue();
	normalizer.sample(snapshot(), released, 1, dt);
	expect(moves(released)).toEqual([]);

	const q2 = new UiEventQueue();
	normalizer.sample(held, q2, 1, dt);
	expect(moves(q2)).toEqual(["down"]);
});

test("analog stick collapses to a four-way focusmove", () => {
	const normalizer = new InputNormalizer();
	const queue = new UiEventQueue();
	normalizer.sample(snapshot({ stick: [0.9, 0] }), queue, 1, 0.016);
	expect(moves(queue)).toEqual(["right"]);
});

test("opposing directions cancel out", () => {
	const normalizer = new InputNormalizer();
	const queue = new UiEventQueue();
	normalizer.sample(snapshot({ buttons: [14, 15] }), queue, 1, 0.016);
	expect(moves(queue)).toEqual([]);
});

test("gamepad south synthesizes a confirm edge", () => {
	const normalizer = new InputNormalizer();

	const idle = new UiEventQueue();
	normalizer.sample(snapshot(), idle, 1, 0.016);

	const pressed = new UiEventQueue();
	normalizer.sample(snapshot({ buttons: [0] }), pressed, 1, 0.016);
	const types = pressed.entries.map((entry) => entry.event.type);
	expect(types).toContain("confirm");

	const held = new UiEventQueue();
	normalizer.sample(snapshot({ buttons: [0] }), held, 1, 0.016);
	expect(held.entries.map((entry) => entry.event.type)).not.toContain(
		"confirm",
	);
});
