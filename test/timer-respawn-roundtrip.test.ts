import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import type { EntityId } from "../src/engine/ecs";
import type { Seconds } from "../src/engine/duration";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { serializeWorld } from "../src/engine/serialization/serialize";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import type { Time } from "../src/engine/clock";
import type { UpdateContext } from "../src/engine/system";
import { TimerComponent } from "../src/engine/timer/timer-component";
import {
	scheduleEvent,
	TimerSystem,
} from "../src/engine/timer/timer-system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";
import { SpawnEvent } from "../src/game/events";
import { SpawnPointComponent } from "../src/game/respawn/spawn-point-component";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

const time = (dt: number): Time =>
	({ elapsed: 0 as Seconds, dt: dt as Seconds, scale: 1 }) as Time;

const tick = (world: World, dt: number): void => {
	new TimerSystem().update({
		time: time(dt),
		ecs: world.ecs,
		events: world.events,
	} as unknown as UpdateContext);
	world.ecs.flushDestroyed();
};

test("a scheduled respawn timer survives serialize/deserialize and still fires with its SpawnEvent payload", () => {
	const spawnPointId = crypto.randomUUID() as EntityId;
	const deadId = crypto.randomUUID() as EntityId;

	const source = new World({ x: 0, y: 0 });
	source.ecs.createEntity(
		[
			new SpawnPointComponent("enemy", false),
			new TransformComponent(new Vector2(12, 34)),
		],
		spawnPointId,
	);
	scheduleEvent(
		source.ecs,
		3 as Seconds,
		new SpawnEvent(spawnPointId, deadId),
	);

	const data = serializeWorld(source.ecs);

	const json = JSON.stringify(data);
	expect(json).toContain("Timer");
	expect(json).toContain("SpawnEvent");

	const fresh = new World({ x: 0, y: 0 });
	deserializeWorld(fresh, data);

	const timers = fresh.ecs.query(TimerComponent);
	expect(timers).toHaveLength(1);
	const restored = timers[0]![1].event as SpawnEvent;
	expect(restored).toBeInstanceOf(SpawnEvent);
	expect(restored.spawnPoint.id).toBe(spawnPointId);
	expect(restored.id.id).toBe(deadId);

	tick(fresh, 1);
	expect(fresh.events.read(SpawnEvent)).toHaveLength(0);

	tick(fresh, 5);
	const emitted = fresh.events.read(SpawnEvent);
	expect(emitted).toHaveLength(1);
	expect(emitted[0]!.spawnPoint.id).toBe(spawnPointId);
	expect(emitted[0]!.id.id).toBe(deadId);
	expect(fresh.ecs.query(TimerComponent)).toHaveLength(0);

	source.dispose();
	fresh.dispose();
});

test("a respawn timer whose spawn point ref is null degrades gracefully (no crash, still expires)", () => {
	const world = new World({ x: 0, y: 0 });
	scheduleEvent(world.ecs, 1 as Seconds, new SpawnEvent(null, null));

	const fresh = new World({ x: 0, y: 0 });
	deserializeWorld(fresh, serializeWorld(world.ecs));

	tick(fresh, 2);
	const emitted = fresh.events.read(SpawnEvent);
	expect(emitted).toHaveLength(1);
	expect(emitted[0]!.spawnPoint.id).toBeNull();
	expect(fresh.ecs.query(TimerComponent)).toHaveLength(0);

	world.dispose();
	fresh.dispose();
});
