import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import { PhysicsBodyComponent } from "../src/engine/physics/physics-body-component";
import { PhysicsSystem } from "../src/engine/physics/physics-system";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { serializeWorld } from "../src/engine/serialization/serialize";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import type { UpdateContext } from "../src/engine/system";
import { World } from "../src/engine/world";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

const step = (world: World, dt = 20): void => {
	new PhysicsSystem().update({
		dt,
		ecs: world.ecs,
		world,
	} as UpdateContext);
};

test("PhysicsBody velocity survives serialize/deserialize round-trip", () => {
	const source = new World({ x: 0, y: 0 });
	const id = source.ecs.createEntity([
		new TransformComponent(new Vector2(0, 0)),
		new PhysicsBodyComponent("dynamic"),
	]);

	const phys = source.ecs.getComponent(id, PhysicsBodyComponent)!;
	step(source);
	phys.linearVelocity = new Vector2(50, 0);
	step(source);

	const startX = source.ecs.getComponent(id, TransformComponent)!
		.position.x;
	step(source);
	const movedX = source.ecs.getComponent(id, TransformComponent)!
		.position.x;
	expect(movedX).toBeGreaterThan(startX);
	expect(phys.velocity.x).toBeCloseTo(50, 3);

	const savedVelocityX = phys.velocity.x;
	const snapshot = serializeWorld(source.ecs);

	const target = new World({ x: 0, y: 0 });
	deserializeWorld(target, snapshot);

	const restored = target.ecs.getComponent(id, PhysicsBodyComponent)!;
	expect(restored.body).toBeNull();
	expect(restored.velocity.x).toBeCloseTo(savedVelocityX, 3);

	const beforeX = target.ecs.getComponent(id, TransformComponent)!
		.position.x;
	step(target);
	const afterX = target.ecs.getComponent(id, TransformComponent)!
		.position.x;

	expect(restored.velocity.x).toBeCloseTo(savedVelocityX, 1);
	expect(afterX).toBeGreaterThan(beforeX);
});
