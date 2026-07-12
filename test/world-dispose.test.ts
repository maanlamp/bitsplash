import { expect, spyOn, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { World } from "../src/engine/world";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

type Freeable = { free: () => void };
type Backend = { physics: { world: Freeable; queue: Freeable } };

test("dispose frees the Rapier world and event queue without throwing", () => {
	const world = new World({ x: 0, y: 20 });
	const backend = (world as unknown as Backend).physics;
	const worldFree = spyOn(backend.world, "free");
	const queueFree = spyOn(backend.queue, "free");

	expect(() => world.dispose()).not.toThrow();
	expect(worldFree).toHaveBeenCalledTimes(1);
	expect(queueFree).toHaveBeenCalledTimes(1);
});

test("dispose is idempotent and never double-frees", () => {
	const world = new World({ x: 0, y: 20 });
	const backend = (world as unknown as Backend).physics;
	const worldFree = spyOn(backend.world, "free");
	const queueFree = spyOn(backend.queue, "free");

	world.dispose();
	expect(() => world.dispose()).not.toThrow();

	expect(worldFree).toHaveBeenCalledTimes(1);
	expect(queueFree).toHaveBeenCalledTimes(1);
});
