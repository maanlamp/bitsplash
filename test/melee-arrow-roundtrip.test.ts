import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import type { Seconds } from "../src/engine/duration";
import { MachineState } from "../src/engine/fsm/machine-state";
import { FacingComponent } from "../src/engine/locomotion/facing-component";
import { PhysicsBodyComponent } from "../src/engine/physics/physics-body-component";
import { PhysicsSystem } from "../src/engine/physics/physics-system";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { serializeWorld } from "../src/engine/serialization/serialize";
import { SpriteComponent } from "../src/engine/sprite/sprite-component";
import type { UpdateContext } from "../src/engine/system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";
import { Layer, collisionMatrix } from "../src/game/collision";
import { ArrowComponent } from "../src/game/combat/arrow-component";
import { ArrowSystem } from "../src/game/combat/arrow-system";
import { MeleeComponent } from "../src/game/combat/melee-component";
import { MeleeSystem } from "../src/game/combat/melee-system";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

const roundTrip = (source: World): World => {
	const snapshot = serializeWorld(source.ecs);
	const target = new World({ x: 0, y: 20 });
	deserializeWorld(target, snapshot);
	return target;
};

const ctx = (world: World, dt: number): UpdateContext =>
	({
		dt,
		ecs: world.ecs,
		world,
		events: world.events,
	}) as unknown as UpdateContext;

// MELEE-WINDUP cluster: Melee.machine must survive so a mid-windup swing
// resumes; Melee.triggered is a one-frame pulse and must stay transient.
test("melee mid-windup resumes after round-trip without a phantom swing", () => {
	const source = new World({ x: 0, y: 20 });
	const melee = new MeleeComponent(1.5, 180, 0.4, 0.6);
	melee.machine = new MachineState("windup", 0.3);
	melee.triggered = true;
	const id = source.ecs.createEntity([
		melee,
		new TransformComponent(new Vector2(0, 0)),
		new FacingComponent(1),
	]);

	const target = roundTrip(source);
	const restored = target.ecs.getComponent(id, MeleeComponent)!;

	// Machine state (the load-bearing swing progress) resumes exactly.
	expect(restored.machine.current).toBe("windup");
	expect(restored.machine.elapsed).toBe(0.3);
	// triggered is transient (Kind-3): reset to false, never persisted.
	expect(restored.triggered).toBe(false);

	const system = new MeleeSystem();
	let swings = 0;
	let prev = restored.machine.current;
	// windup completes at 0.4s; step 16ms frames and count entries to recover.
	for (let i = 0; i < 100; i++) {
		system.update(ctx(target, 16));
		if (
			prev !== "recover" &&
			restored.machine.current === "recover"
		) {
			swings++;
		}
		prev = restored.machine.current;
	}

	// The resumed windup fires exactly one strike, then unwinds to idle.
	expect(swings).toBe(1);
	expect(restored.machine.current).toBe("idle");
});

// ARROW-ATTACHMENT cluster: a stuck arrow must stay stuck (not re-launch,
// not revert to a live dynamic projectile) after a round-trip.
test("stuck arrow stays stuck after round-trip", () => {
	const source = new World({ x: 0, y: 20 });
	const host = source.ecs.createEntity([
		new TransformComponent(new Vector2(100, 100)),
	]);

	const arrow = new ArrowComponent();
	arrow.launched = true;
	arrow.stuck = true;
	arrow.stuckRemaining = 4 as Seconds;
	arrow.attachedTo.set(host);
	arrow.attachOffsetX = 5;
	arrow.attachOffsetY = -3;
	const arrowId = source.ecs.createEntity([
		arrow,
		new TransformComponent(new Vector2(105, 97)),
		new PhysicsBodyComponent("static"),
		new SpriteComponent(),
	]);

	const target = roundTrip(source);
	const restored = target.ecs.getComponent(arrowId, ArrowComponent)!;

	// All attachment/in-flight fields round-trip; attachedTo is a soft ref.
	expect(restored.launched).toBe(true);
	expect(restored.stuck).toBe(true);
	expect(restored.stuckRemaining).toBe(4 as Seconds);
	expect(restored.attachedTo.id).toBe(host);
	expect(restored.attachOffsetX).toBe(5);
	expect(restored.attachOffsetY).toBe(-3);

	const physics = new PhysicsSystem();
	const arrows = new ArrowSystem();
	physics.update(ctx(target, 16));
	arrows.update(ctx(target, 16));

	// Still stuck (did not re-launch or resume to a dynamic body); its
	// despawn countdown ticked down but has not expired.
	expect(restored.stuck).toBe(true);
	expect(restored.launched).toBe(true);
	expect(restored.attachedTo.id).toBe(host);
	expect(restored.stuckRemaining).toBeLessThan(4);
	expect(restored.stuckRemaining).toBeGreaterThan(0);
	expect(target.ecs.getComponent(arrowId, ArrowComponent)).toBe(
		restored,
	);
});

// ARROW-ATTACHMENT cluster: when an arrow sticks, its PhysicsBody type must be
// flipped to "static" so a save/load rebuilds a static (not dynamic) body,
// coherent with Arrow.stuck.
test("arrow that sticks persists a static PhysicsBody type across a round-trip", () => {
	const source = new World({ x: 0, y: 20 }, collisionMatrix);
	source.ecs.createEntity([
		new TransformComponent(new Vector2(10, 0)),
		new PhysicsBodyComponent(
			"static",
			8,
			8,
			1,
			0,
			0,
			true,
			0,
			Layer.Terrain,
		),
	]);

	const arrow = new ArrowComponent();
	arrow.launched = true;
	arrow.stuck = false;
	const arrowId = source.ecs.createEntity([
		arrow,
		new TransformComponent(new Vector2(0, 0)),
		new PhysicsBodyComponent(
			"dynamic",
			4,
			2,
			1,
			0,
			0,
			true,
			0,
			Layer.Projectile,
		),
		new SpriteComponent(),
	]);

	const physics = new PhysicsSystem();
	const arrows = new ArrowSystem();
	physics.update(ctx(source, 32));
	const sourceRb = source.ecs.getComponent(
		arrowId,
		PhysicsBodyComponent,
	)!;
	sourceRb.linearVelocity = new Vector2(600, 0);
	arrows.update(ctx(source, 16));

	// The live body stuck and the persisted component type flipped to static.
	expect(arrow.stuck).toBe(true);
	expect(sourceRb.type).toBe("static");

	const target = roundTrip(source);
	const restored = target.ecs.getComponent(
		arrowId,
		PhysicsBodyComponent,
	)!;
	expect(restored.type).toBe("static");

	new PhysicsSystem().update(ctx(target, 16));
	expect(restored.body!.isStatic).toBe(true);
});

// ARROW-ATTACHMENT cluster: a launched (in-flight) arrow must stay launched
// so it is not re-launched at aimAngle*speed on load.
test("launched arrow stays launched after round-trip", () => {
	const source = new World({ x: 0, y: 20 });
	const arrow = new ArrowComponent();
	arrow.launched = true;
	arrow.stuck = false;
	const arrowId = source.ecs.createEntity([
		arrow,
		new TransformComponent(new Vector2(0, 0)),
		new PhysicsBodyComponent("dynamic"),
		new SpriteComponent(),
	]);

	const target = roundTrip(source);
	const restored = target.ecs.getComponent(arrowId, ArrowComponent)!;
	expect(restored.launched).toBe(true);
	expect(restored.stuck).toBe(false);

	const physics = new PhysicsSystem();
	const arrows = new ArrowSystem();
	physics.update(ctx(target, 16));

	// Sentinel velocity distinct from the launch vector (aimAngle 0 * speed
	// 360 = (360, 0)). A re-launch would overwrite it.
	const rb = target.ecs.getComponent(arrowId, PhysicsBodyComponent)!;
	rb.linearVelocity = new Vector2(0, -500);
	arrows.update(ctx(target, 16));

	const velocity = rb.linearVelocity;
	expect(restored.launched).toBe(true);
	expect(Math.abs(velocity.x)).toBeLessThan(1);
	expect(velocity.y).toBeLessThan(-100);
});
