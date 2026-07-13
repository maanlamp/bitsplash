import { expect, test } from "bun:test";
import { ECS } from "../src/engine/ecs";
import EventBus from "../src/engine/events";
import { ActionResolver } from "../src/engine/input/bindings/action-resolver";
import { MemorySettingsStore } from "../src/engine/input/bindings/memory-settings-store";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import type { UpdateContext } from "../src/engine/system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { InteractEvent } from "../src/game/events";
import { ACTION_IDS } from "../src/game/input/action-ids";
import { platformerCatalog } from "../src/game/input/platformer-catalog";
import { InteractableComponent } from "../src/game/interaction/interactable-component";
import { InteractionStateComponent } from "../src/game/interaction/interaction-state-component";
import { InteractionSystem } from "../src/game/interaction/interaction-system";
import { PlayerInputComponent } from "../src/game/player/player-input-component";

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

const makeWorld = () => {
	const ecs = new ECS();
	const events = new EventBus();
	const resolver = new ActionResolver(
		platformerCatalog,
		new MemorySettingsStore(),
	);
	const system = new InteractionSystem();

	ecs.createEntity([new InteractionStateComponent()]);
	ecs.createEntity([
		new PlayerInputComponent(),
		new TransformComponent(new Vector2(0, 0)),
	]);
	ecs.createEntity([
		new InteractableComponent(32, "open"),
		new TransformComponent(new Vector2(4, 0)),
	]);

	const step = (keys: string[], preConsume?: () => void): number => {
		events.clear();
		resolver.step(snapshot(keys), 16);
		preConsume?.();
		const ctx = {
			ecs,
			actions: resolver,
			events,
		} as unknown as UpdateContext;
		system.update(ctx);
		return events.read(InteractEvent).length;
	};

	return { resolver, step };
};

test("interact fires an InteractEvent once per press, not while held", () => {
	const w = makeWorld();
	expect(w.step([])).toBe(0);
	expect(w.step(["E"])).toBe(1);
	expect(w.step(["E"])).toBe(0);
	expect(w.step([])).toBe(0);
	expect(w.step(["E"])).toBe(1);
});

test("consuming the interact token suppresses the InteractEvent that step", () => {
	const w = makeWorld();
	const fired = w.step(["E"], () => {
		w.resolver.consume(ACTION_IDS.dialogueAdvance);
	});
	expect(fired).toBe(0);
});
