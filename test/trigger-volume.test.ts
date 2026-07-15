import { expect, test } from "bun:test";
import { ECS, type EntityId } from "../src/engine/ecs";
import EventBus, { CollisionEvent } from "../src/engine/events";
import type { UpdateContext } from "../src/engine/system";
import { TriggerEnteredEvent } from "../src/engine/trigger/events";
import { TriggerVolumeComponent } from "../src/engine/trigger/trigger-volume-component";
import {
	type TriggerVolumeBindings,
	TriggerVolumeSystem,
} from "../src/engine/trigger/trigger-volume-system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";

const makeWorld = (setFlags: ReadonlySet<string> = new Set()) => {
	const ecs = new ECS();
	const events = new EventBus();
	const bindings: TriggerVolumeBindings = {
		flagActive: (_ctx, flag) => setFlags.has(flag),
	};
	const system = new TriggerVolumeSystem(bindings);

	const actor = ecs.createEntity([
		new TransformComponent(new Vector2(0, 0)),
	]);

	const place = (volume: TriggerVolumeComponent): EntityId =>
		ecs.createEntity([
			volume,
			new TransformComponent(new Vector2(0, 0)),
		]);

	const enter = (volumeId: EntityId): void => {
		events.emit(new CollisionEvent(actor, volumeId));
	};

	const step = (): readonly TriggerEnteredEvent[] => {
		const ctx = { ecs, events } as unknown as UpdateContext;
		system.update(ctx);
		const fired = [...events.read(TriggerEnteredEvent)];
		events.clear();
		return fired;
	};

	return { ecs, actor, place, enter, step };
};

test("one-shot fires once, then stays consumed on re-entry", () => {
	const w = makeWorld();
	const volume = new TriggerVolumeComponent("seq:intro");
	const id = w.place(volume);

	w.enter(id);
	const first = w.step();
	expect(first).toHaveLength(1);
	expect(first[0]!.targetId).toBe("seq:intro");
	expect(first[0]!.volume).toBe(id);
	expect(first[0]!.entered).toBe(w.actor);
	expect(volume.consumed).toBe(true);

	w.enter(id);
	expect(w.step()).toHaveLength(0);
});

test("repeat fires every enter and never consumes", () => {
	const w = makeWorld();
	const volume = new TriggerVolumeComponent("seq:loop", true);
	const id = w.place(volume);

	w.enter(id);
	expect(w.step()).toHaveLength(1);
	w.enter(id);
	expect(w.step()).toHaveLength(1);
	expect(volume.consumed).toBe(false);
});

test("required chronicle flag gates entry", () => {
	const gated = makeWorld(new Set());
	const gatedVolume = new TriggerVolumeComponent(
		"seq:gated",
		false,
		"door-open",
	);
	const gatedId = gated.place(gatedVolume);
	gated.enter(gatedId);
	expect(gated.step()).toHaveLength(0);
	expect(gatedVolume.consumed).toBe(false);

	const open = makeWorld(new Set(["door-open"]));
	const openVolume = new TriggerVolumeComponent(
		"seq:gated",
		false,
		"door-open",
	);
	const openId = open.place(openVolume);
	open.enter(openId);
	expect(open.step()).toHaveLength(1);
});
