import { expect, test } from "bun:test";
import { Camera2D } from "../src/engine/camera/camera-2d";
import { Camera2DComponent } from "../src/engine/camera/camera-2d-component";
import { ECS } from "../src/engine/ecs";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import type { GamepadState } from "../src/engine/input/gamepad";
import type { UpdateContext } from "../src/engine/system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { AimComponent } from "../src/game/aim/aim-component";
import { AimSystem } from "../src/game/aim/aim-system";

type SnapshotSpec = {
	keys?: string[];
	mouse?: { x: number; y: number };
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
	for (const pad in spec.sticks ?? {}) {
		const axes: Record<string, Vector2> = {};
		const stickSpec = spec.sticks![pad]!;
		for (const pair in stickSpec) {
			const [x, y] = stickSpec[pair]!;
			axes[pair] = new Vector2(x, y);
		}
		gamepads[pad] = {
			buttons: {},
			axes,
			id: "",
			mapping: "standard",
		};
	}
	return {
		keyboard: { keys: booleanRecord(spec.keys ?? []) },
		mouse: {
			buttons: {},
			position: spec.mouse ?? { x: 0, y: 0 },
			wheel: { x: 0, y: 0 },
		},
		gamepads,
	};
};

const DT_MS = 100;

const makeWorld = (): {
	ecs: ECS;
	aim: AimComponent;
	system: AimSystem;
} => {
	const ecs = new ECS();
	ecs.createEntity([
		new Camera2DComponent(new Camera2D(new Vector2(0, 0), 1)),
	]);
	const aim = new AimComponent();
	ecs.createEntity([aim, new TransformComponent(new Vector2(0, 0))]);
	return { ecs, aim, system: new AimSystem() };
};

const step = (
	system: AimSystem,
	ecs: ECS,
	spec: SnapshotSpec,
): void => {
	system.update({
		ecs,
		input: snapshot(spec),
		dt: DT_MS,
	} as unknown as UpdateContext);
};

test("mouse source sets the aim angle from the cursor position", () => {
	const { ecs, aim, system } = makeWorld();
	step(system, ecs, { mouse: { x: 10, y: 0 } });
	expect(aim.aim.sample()).toBeCloseTo(0, 5);

	step(system, ecs, { mouse: { x: 0, y: 10 } });
	expect(aim.aim.sample()).toBeCloseTo(Math.PI / 2, 5);
});

test("gamepad points the aim at the absolute stick direction", () => {
	const { ecs, aim, system } = makeWorld();
	step(system, ecs, { sticks: { "0": { "1": [0, 1] } } });
	step(system, ecs, { sticks: { "0": { "1": [0, 1] } } });
	step(system, ecs, { sticks: { "0": { "1": [0, 1] } } });
	expect(aim.aim.sample()).toBeCloseTo(Math.PI / 2, 5);
});

test("straight-down stick input aims straight down", () => {
	const { ecs, aim, system } = makeWorld();
	step(system, ecs, { mouse: { x: 10, y: 0 } });
	expect(aim.aim.sample()).toBeCloseTo(0, 5);

	step(system, ecs, {
		mouse: { x: 10, y: 0 },
		sticks: { "0": { "1": [0, 1] } },
	});
	step(system, ecs, {
		mouse: { x: 10, y: 0 },
		sticks: { "0": { "1": [0, 1] } },
	});
	expect(aim.aim.sample()).toBeCloseTo(Math.PI / 2, 5);
});

test("gamepad holds the last angle when the stick returns to center", () => {
	const { ecs, aim, system } = makeWorld();
	step(system, ecs, { sticks: { "0": { "1": [0, 1] } } });
	step(system, ecs, { sticks: { "0": { "1": [0, 1] } } });
	expect(aim.aim.sample()).toBeCloseTo(Math.PI / 2, 5);

	step(system, ecs, { sticks: { "0": { "1": [0, 0] } } });
	expect(aim.aim.sample()).toBeCloseTo(Math.PI / 2, 5);
});

test("keyboard movement does not yank stick aim back to the cursor", () => {
	const { ecs, aim, system } = makeWorld();
	step(system, ecs, {
		mouse: { x: 10, y: 0 },
		sticks: { "0": { "1": [0, 1] } },
	});
	step(system, ecs, {
		mouse: { x: 10, y: 0 },
		sticks: { "0": { "1": [0, 1] } },
	});
	step(system, ecs, {
		mouse: { x: 10, y: 0 },
		sticks: { "0": { "1": [0, 1] } },
	});
	expect(aim.aim.sample()).toBeCloseTo(Math.PI / 2, 5);

	for (let i = 0; i < 5; i += 1) {
		step(system, ecs, {
			keys: ["A"],
			mouse: { x: 10, y: 0 },
			sticks: { "0": { "1": [0, 1] } },
		});
	}
	expect(aim.aim.sample()).toBeCloseTo(Math.PI / 2, 5);
});
