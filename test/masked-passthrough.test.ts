import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { MemorySettingsStore } from "../src/engine/input/bindings/memory-settings-store";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import type { Input } from "../src/engine/input/input";
import { Clock } from "../src/engine/clock";
import type { Time } from "../src/engine/clock";
import EventBus from "../src/engine/events";
import { SceneManager } from "../src/engine/scene/scene-manager";
import { Scene, SceneConfig } from "../src/engine/scene/scene";
import type { GlobalServices } from "../src/engine/services";
import {
	type UpdateContext,
	UpdateSystem,
} from "../src/engine/system";
import { World } from "../src/engine/world";
import { ACTION_IDS } from "../src/game/input/action-ids";
import { createPlatformerActions } from "../src/game/input/platformer-actions";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

class JumpRecorder extends UpdateSystem {
	count = 0;
	update(ctx: UpdateContext): void {
		if (ctx.actions.fired(ACTION_IDS.jump)) {
			this.count++;
		}
	}
}

const snapshot = (space: boolean): DeviceSnapshot => ({
	keyboard: { keys: { SPACE: space } },
	mouse: {
		buttons: {},
		position: { x: 0, y: 0 },
		wheel: { x: 0, y: 0 },
	},
	gamepads: {},
});

const makeScene = (): { scenes: SceneManager; rec: JumpRecorder } => {
	const world = new World({ x: 0, y: 20 });
	const rec = new JumpRecorder();
	world.ecs.addUpdateSystem(rec);
	const services: GlobalServices = {
		input: snapshot(false) as unknown as Input,
		assetManager: { getFontFamilies: () => null } as never,
		audio: {} as never,
		clock: new Clock(),
		events: new EventBus(),
		settings: new MemorySettingsStore(),
	};
	const scenes = new SceneManager(services);
	scenes.setBase(
		new Scene({
			kind: "game",
			name: "test",
			config: new SceneConfig(),
			world,
			actions: createPlatformerActions(new MemorySettingsStore()),
			gameplaySystems: [],
		}),
	);
	return { scenes, rec };
};

const time = { elapsed: 0, dt: 0.016, scale: 1 } as unknown as Time;

test("stable source: jump fires once even as the masked snapshot identity changes each frame", () => {
	const { scenes, rec } = makeScene();
	const source = snapshot(false);

	// A distinct masked object every frame (as consumption would produce),
	// but a stable underlying device source.
	scenes.update({ dt: 16 as never, time }, snapshot(false), source);
	scenes.update({ dt: 16 as never, time }, snapshot(true), source);
	scenes.update({ dt: 16 as never, time }, snapshot(true), source);
	scenes.update({ dt: 16 as never, time }, snapshot(true), source);

	expect(rec.count).toBe(1);
});

test("churning source resets edges every frame (why the source param exists)", () => {
	const { scenes, rec } = makeScene();

	// No stable source: source defaults to the (distinct) masked object each
	// frame, so inputChanged fires resetEdges every frame and the press is lost.
	scenes.update({ dt: 16 as never, time }, snapshot(false));
	scenes.update({ dt: 16 as never, time }, snapshot(true));
	scenes.update({ dt: 16 as never, time }, snapshot(true));

	expect(rec.count).toBe(0);
});
