import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { PersistentComponent } from "../src/engine/scene/persistent-component";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { serializeWorld } from "../src/engine/serialization/serialize";
import { World } from "../src/engine/world";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

test("PersistentComponent round-trips through serialize/deserialize", () => {
	const source = new World({ x: 0, y: 20 });
	const id = source.ecs.createEntity([new PersistentComponent()]);

	const snapshot = serializeWorld(source.ecs);
	const entity = snapshot.find((e) => e.id === id);
	expect(entity).toBeDefined();
	expect(entity!.components).toHaveProperty("PersistentComponent");

	const target = new World({ x: 0, y: 20 });
	deserializeWorld(target, snapshot);

	const restored = target.ecs.getComponent(id, PersistentComponent);
	expect(restored).toBeInstanceOf(PersistentComponent);
});
