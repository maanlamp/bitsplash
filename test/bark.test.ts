import { expect, test } from "bun:test";
import { ECS } from "../src/engine/ecs";
import { Duration } from "../src/engine/duration";
import { serializableType } from "../src/engine/serialization/registry";
import {
	reconstruct,
	walkFields,
} from "../src/engine/serialization/value";
import type { UpdateContext } from "../src/engine/system";
import { BarkComponent } from "../src/game/dialogue/bark-component";
import { BarkSystem } from "../src/game/dialogue/bark-system";

const step = (ecs: ECS, system: BarkSystem, dt: number): void => {
	system.update({ dt, ecs } as unknown as UpdateContext);
};

test("bark expires once its ttl elapses", () => {
	const ecs = new ECS();
	const system = new BarkSystem();
	const id = ecs.createEntity([
		new BarkComponent("hello", new Duration(1)),
	]);

	step(ecs, system, 500);
	expect(ecs.getComponent(id, BarkComponent)).toBeDefined();
	expect(
		ecs.getComponent(id, BarkComponent)!.elapsed.seconds,
	).toBeCloseTo(0.5);

	step(ecs, system, 600);
	expect(ecs.getComponent(id, BarkComponent)).toBeUndefined();
});

test("mid-bark serialize/deserialize preserves remaining ttl", () => {
	const ecs = new ECS();
	const system = new BarkSystem();
	ecs.createEntity([new BarkComponent("hi there", new Duration(3))]);

	step(ecs, system, 1000);

	const type = serializableType("Bark")!;
	const bark = ecs.query(BarkComponent)[0]![1];
	const data = walkFields(type, bark);
	const restored = reconstruct(type, data) as BarkComponent;

	const remaining = restored.ttl.seconds - restored.elapsed.seconds;
	expect(restored.text).toBe("hi there");
	expect(restored.ttl.seconds).toBe(3);
	expect(restored.elapsed.seconds).toBeCloseTo(1);
	expect(remaining).toBeCloseTo(2);

	const revived = new ECS();
	const reviveSystem = new BarkSystem();
	const id = revived.createEntity([restored]);
	step(revived, reviveSystem, 1900);
	expect(revived.getComponent(id, BarkComponent)).toBeDefined();
	step(revived, reviveSystem, 200);
	expect(revived.getComponent(id, BarkComponent)).toBeUndefined();
});
