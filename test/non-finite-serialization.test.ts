import { expect, test } from "bun:test";
import { ECS } from "../src/engine/ecs";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import {
	serializable,
	serialize,
} from "../src/engine/serialization/serializable";
import { serializeWorld } from "../src/engine/serialization/serialize";
import type { World } from "../src/engine/world";

@serializable("NonFiniteFixture")
class NonFiniteFixture {
	@serialize() positiveInfinity: number = Infinity;
	@serialize() negativeInfinity: number = -Infinity;
	@serialize() notANumber: number = Number.NaN;
	@serialize() finite: number = 42.5;
}

test("non-finite numbers survive a JSON round-trip", () => {
	const source = new ECS();
	const component = new NonFiniteFixture();
	component.positiveInfinity = Infinity;
	component.negativeInfinity = -Infinity;
	component.notANumber = Number.NaN;
	component.finite = 42.5;
	const id = source.createEntity([component]);

	const snapshot = serializeWorld(source);
	const wire = JSON.parse(JSON.stringify(snapshot));

	const target = new ECS();
	deserializeWorld({ ecs: target } as unknown as World, wire);
	const restored = target.getComponent(id, NonFiniteFixture)!;

	expect(restored.positiveInfinity).toBe(Infinity);
	expect(restored.negativeInfinity).toBe(-Infinity);
	expect(Number.isNaN(restored.notANumber)).toBe(true);
	expect(restored.finite).toBe(42.5);
});
