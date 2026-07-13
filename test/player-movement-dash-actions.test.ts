import { expect, test } from "bun:test";
import { ECS } from "../src/engine/ecs";
import { ActionResolver } from "../src/engine/input/bindings/action-resolver";
import { MemorySettingsStore } from "../src/engine/input/bindings/memory-settings-store";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import { FacingComponent } from "../src/engine/locomotion/facing-component";
import { MovementIntentComponent } from "../src/engine/locomotion/movement-intent-component";
import { PhysicsBodyComponent } from "../src/engine/physics/physics-body-component";
import type { RigidBody } from "../src/engine/physics/rigid-body";
import type { UpdateContext } from "../src/engine/system";
import Vector2 from "../src/engine/vector2";
import { platformerCatalog } from "../src/game/input/platformer-catalog";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
import { PlayerMovementSystem } from "../src/game/player/player-movement-system";

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

const stubBody = (): RigidBody => {
	let vel = new Vector2(0, 0);
	return {
		get linearVelocity(): Vector2 {
			return vel;
		},
		set linearVelocity(v: { x: number; y: number }) {
			vel = new Vector2(v.x, v.y);
		},
		mass: 1,
		applyImpulse(): void {},
		touchingContacts(): Iterable<never> {
			return [];
		},
	} as unknown as RigidBody;
};

const makeWorld = () => {
	const ecs = new ECS();
	const resolver = new ActionResolver(
		platformerCatalog,
		new MemorySettingsStore(),
	);
	const system = new PlayerMovementSystem();

	const player = new PlayerInputComponent();
	player.canDash = true;
	player.grounded = true;
	const rb = new PhysicsBodyComponent();
	rb.body = stubBody();
	ecs.createEntity([
		player,
		new MovementIntentComponent(),
		new FacingComponent(1),
		rb,
	]);

	const step = (keys: string[]): void => {
		resolver.step(snapshot(keys), 16);
		const ctx = {
			dt: 16,
			ecs,
			actions: resolver,
		} as unknown as UpdateContext;
		system.update(ctx);
	};

	return { player, step };
};

test("dash starts while the dash action is active and not before", () => {
	const w = makeWorld();
	w.step([]);
	expect(w.player.dashTimeRemaining).toBe(0);
	w.step(["SHIFT"]);
	expect(w.player.dashTimeRemaining).toBeGreaterThan(0);
});

test("dash does not start without the dash action", () => {
	const w = makeWorld();
	w.step([]);
	w.step([]);
	expect(w.player.dashTimeRemaining).toBe(0);
});
