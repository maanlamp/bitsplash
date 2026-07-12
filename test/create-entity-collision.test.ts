import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import { ECS, type EntityId } from "../src/engine/ecs";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { serializeWorld } from "../src/engine/serialization/serialize";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";

class Foo {}

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

test("createEntity throws loudly on explicit id collision", () => {
	const ecs = new ECS();
	const id = ecs.createEntity([new Foo()]);
	expect(() => ecs.createEntity([new Foo()], id)).toThrow(
		/already exists/,
	);
	expect(ecs.entities()).toHaveLength(1);
});

test("createEntity re-allows an id after the previous entity is destroyed", () => {
	const ecs = new ECS();
	const id = ecs.createEntity([new Foo()]);
	ecs.destroy(id);
	ecs.flushDestroyed();
	expect(() => ecs.createEntity([new Foo()], id)).not.toThrow();
	expect(ecs.entities()).toContain(id);
});

test("auto-id creation never collides across many entities", () => {
	const ecs = new ECS();
	const ids = new Set<EntityId>();
	for (let i = 0; i < 100; i++) {
		ids.add(ecs.createEntity([new Foo()]));
	}
	expect(ids.size).toBe(100);
});

test("deserializeWorld round-trips into a fresh world without collision", () => {
	const source = new World({ x: 0, y: 20 });
	const a = source.ecs.createEntity([
		new TransformComponent(new Vector2(3, 7)),
	]);
	const b = source.ecs.createEntity([
		new TransformComponent(new Vector2(-1, 2)),
	]);
	const snapshot = serializeWorld(source.ecs);

	const target = new World({ x: 0, y: 20 });
	deserializeWorld(target, snapshot);

	expect([...target.ecs.entities()].sort()).toEqual([a, b].sort());
	const restored = target.ecs.getComponent(a, TransformComponent)!;
	expect(restored.position.x).toBe(3);
	expect(restored.position.y).toBe(7);

	source.dispose();
	target.dispose();
});

test("deserializeWorld into a cleared world reuses ids without collision", () => {
	const world = new World({ x: 0, y: 20 });
	world.ecs.createEntity([new TransformComponent(new Vector2(5, 5))]);
	const snapshot = serializeWorld(world.ecs);

	world.clear();
	expect(() => deserializeWorld(world, snapshot)).not.toThrow();
	expect(world.ecs.entities()).toHaveLength(1);

	world.dispose();
});

test("serializeWorld predicate filters entities; no-arg serializes all", () => {
	const ecs = new ECS();
	const kept = ecs.createEntity([
		new TransformComponent(new Vector2(0, 0)),
	]);
	ecs.createEntity([new TransformComponent(new Vector2(1, 1))]);

	expect(serializeWorld(ecs)).toHaveLength(2);

	const filtered = serializeWorld(ecs, (id) => id === kept);
	expect(filtered).toHaveLength(1);
	expect(filtered[0]!.id).toBe(kept);
});
