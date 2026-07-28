import { expect, test } from "bun:test";
import { Tween } from "../src/engine/animation/tween";
import type { Milliseconds } from "../src/engine/duration";
import { ECS } from "../src/engine/ecs";
import { ScreenFadeComponent } from "../src/engine/fade/screen-fade-component";
import { deserializeEntity } from "../src/engine/serialization/deserialize";
import { serializeEntity } from "../src/engine/serialization/serialize";
import type { World } from "../src/engine/world";

const asWorld = (ecs: ECS): World => ({ ecs }) as unknown as World;

test("a part-played tween resumes where it left off after a round-trip", () => {
	const ecs = new ECS();
	const fade = new ScreenFadeComponent(0);
	fade.tween = new Tween(0, 1, 0.4, "linear");
	fade.tween.tick(100 as Milliseconds);
	const entity = ecs.createEntity([fade]);

	const progressBefore = fade.tween.progress();
	expect(progressBefore).toBeCloseTo(0.25, 6);

	const before = serializeEntity(ecs, entity)!;
	const freshEcs = new ECS();
	const restoredId = deserializeEntity(asWorld(freshEcs), before);
	const restored = freshEcs.getComponent(
		restoredId,
		ScreenFadeComponent,
	)!;

	expect(restored.tween).toBeInstanceOf(Tween);
	expect(restored.tween!.elapsed as number).toBeCloseTo(0.1, 6);
	expect(restored.tween!.progress()).toBeCloseTo(progressBefore, 6);
	expect(restored.tween!.done()).toBe(false);
	expect(serializeEntity(freshEcs, restoredId)).toEqual(before);
});

test("a finished tween restores finished rather than replaying", () => {
	const ecs = new ECS();
	const fade = new ScreenFadeComponent(1);
	fade.tween = new Tween(0, 1, 0.3, "linear");
	fade.tween.tick(300 as Milliseconds);
	const entity = ecs.createEntity([fade]);
	expect(fade.tween.done()).toBe(true);

	const freshEcs = new ECS();
	const restoredId = deserializeEntity(
		asWorld(freshEcs),
		serializeEntity(ecs, entity)!,
	);
	const restored = freshEcs.getComponent(
		restoredId,
		ScreenFadeComponent,
	)!;

	expect(restored.tween!.done()).toBe(true);
	expect(restored.tween!.value()).toBe(1);
});
