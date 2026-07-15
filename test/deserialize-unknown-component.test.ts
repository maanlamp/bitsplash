import { describe, expect, test } from "bun:test";
import { ECS } from "../src/engine/ecs";
import {
	deserializeWorld,
	deserializeEntity,
} from "../src/engine/serialization/deserialize";
import type { SerializedEntity } from "../src/engine/serialization/registry";
import { TransformComponent } from "../src/engine/transform-component";
import type { World } from "../src/engine/world";

// Registering Transform's @serializable flag so the known component survives.
void TransformComponent;

const asWorld = (ecs: ECS): World => ({ ecs }) as unknown as World;

const entity: SerializedEntity = {
	id: "npc-1",
	components: {
		Transform: {},
		Bogus: { foo: 1 },
	},
};

const source = 'scene "Demo"';

describe("unknown component policy", () => {
	test("document-open strict path hard-fails, naming file/entity/component", () => {
		let thrown: Error | null = null;
		try {
			deserializeWorld(asWorld(new ECS()), [entity], source, "throw");
		} catch (error) {
			thrown = error as Error;
		}

		expect(thrown).not.toBeNull();
		const message = thrown!.message;
		expect(message).toContain(source);
		expect(message).toContain("npc-1");
		expect(message).toContain("Bogus");
	});

	test("lenient path still skips the unknown component", () => {
		const ecs = new ECS();
		const id = deserializeEntity(asWorld(ecs), entity);

		expect(ecs.getComponent(id, TransformComponent)).toBeDefined();
		expect(ecs.componentsOf(id).length).toBe(1);
	});
});
