import { expect, spyOn, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import { PhysicsBodyComponent } from "../src/engine/physics/physics-body-component";
import { PhysicsSystem } from "../src/engine/physics/physics-system";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import type { UpdateContext } from "../src/engine/system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";

// Drives the REAL World + PhysicsSystem + real Rapier, stepped synchronously.
// This is the regression guard: under the old setTimeout despawn the body was
// never freed during a bun-test run; the deterministic flush frees it in-line.
// Production loads the bundler build (@dimforge/rapier2d); that build cannot
// instantiate its WASM under bun test, so here we inject the API-identical
// self-contained compat build via loadRapier's loader seam.

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

test("destroy + flushDestroyed frees the Rapier body synchronously", () => {
	const world = new World({ x: 0, y: 20 });
	const ecs = world.ecs;
	const physics = new PhysicsSystem();

	const id = ecs.createEntity([
		new TransformComponent(new Vector2(0, 0)),
		new PhysicsBodyComponent(),
	]);
	const ctx = { dt: 16, ecs, world } as unknown as UpdateContext;
	physics.update(ctx);

	const phys = ecs.getComponent(id, PhysicsBodyComponent)!;
	expect(phys.body).not.toBeNull();

	const backend = (
		world as unknown as {
			physics: { destroyBody: (body: unknown) => void };
		}
	).physics;
	const destroySpy = spyOn(backend, "destroyBody");

	ecs.destroy(id);
	expect(ecs.entities()).toContain(id);

	ecs.flushDestroyed();
	expect(ecs.entities()).not.toContain(id);
	expect(destroySpy).toHaveBeenCalledTimes(1);
	expect(phys.body).toBeNull();
});
