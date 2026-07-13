import { expect, test } from "bun:test";
import { ECS } from "../src/engine/ecs";
import { ActionResolver } from "../src/engine/input/bindings/action-resolver";
import { MemorySettingsStore } from "../src/engine/input/bindings/memory-settings-store";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import { MovementIntentComponent } from "../src/engine/locomotion/movement-intent-component";
import type { UpdateContext } from "../src/engine/system";
import Vector2 from "../src/engine/vector2";
import { platformerCatalog } from "../src/game/input/platformer-catalog";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
import { PlayerIntentSystem } from "../src/game/player/player-intent-system";

const snapshot = (keys: string[]): DeviceSnapshot => {
	const map: Record<string, boolean> = {};
	for (const key of keys) {
		map[key] = true;
	}
	return {
		keyboard: { keys: map },
		mouse: {
			buttons: {},
			position: { x: 0, y: 0 },
			wheel: { x: 0, y: 0 },
		},
		gamepads: {},
	};
};

const withLeftStick = (
	base: DeviceSnapshot,
	x: number,
	y: number,
): DeviceSnapshot => ({
	...base,
	gamepads: {
		"0": {
			buttons: {},
			axes: { "0": new Vector2(x, y) },
			id: "Test Controller",
			mapping: "standard",
		},
	},
});

const makeWorld = () => {
	const ecs = new ECS();
	const resolver = new ActionResolver(
		platformerCatalog,
		new MemorySettingsStore(),
	);
	const system = new PlayerIntentSystem();
	const intent = new MovementIntentComponent();
	ecs.createEntity([new PlayerInputComponent(), intent]);

	const stepInput = (input: DeviceSnapshot): void => {
		resolver.step(input, 16);
		const ctx = {
			ecs,
			actions: resolver,
			input,
		} as unknown as UpdateContext;
		system.update(ctx);
	};

	const step = (keys: string[]): void => {
		stepInput(snapshot(keys));
	};

	return { intent, step, stepInput };
};

test("jump is pressed exactly one frame on the down edge", () => {
	const w = makeWorld();
	w.step([]);
	expect(w.intent.jumpPressed).toBe(false);
	w.step(["SPACE"]);
	expect(w.intent.jumpPressed).toBe(true);
	w.step(["SPACE"]);
	expect(w.intent.jumpPressed).toBe(false);
	w.step([]);
	w.step(["SPACE"]);
	expect(w.intent.jumpPressed).toBe(true);
});

test("horizontal movement is active while the key is held", () => {
	const w = makeWorld();
	w.step([]);
	expect(w.intent.moveX).toBe(0);
	w.step(["A"]);
	expect(w.intent.moveX).toBe(-1);
	w.step(["A"]);
	expect(w.intent.moveX).toBe(-1);
	w.step(["D"]);
	expect(w.intent.moveX).toBe(1);
	w.step(["A", "D"]);
	expect(w.intent.moveX).toBe(0);
	w.step([]);
	expect(w.intent.moveX).toBe(0);
});

test("left analog stick drives moveX with analog magnitude", () => {
	const w = makeWorld();
	w.stepInput(withLeftStick(snapshot([]), 0.6, 0));
	expect(w.intent.moveX).toBeCloseTo(0.6, 5);
	w.stepInput(withLeftStick(snapshot([]), -0.4, 0));
	expect(w.intent.moveX).toBeCloseTo(-0.4, 5);
});

test("left stick within the deadzone falls back to the keyboard", () => {
	const w = makeWorld();
	w.stepInput(withLeftStick(snapshot(["D"]), 0.1, 0));
	expect(w.intent.moveX).toBe(1);
	w.stepInput(withLeftStick(snapshot([]), 0.1, 0));
	expect(w.intent.moveX).toBe(0);
});
