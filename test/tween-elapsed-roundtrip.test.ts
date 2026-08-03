import { expect, test } from "bun:test";
import { Ease } from "../src/engine/animation/ease";
import { Tween } from "../src/engine/animation/tween";
import type { Seconds } from "../src/engine/duration";
import { ECS } from "../src/engine/ecs";
import { ScreenFadeComponent } from "../src/engine/fade/screen-fade-component";
import { seq, fade as fadeOp } from "../src/engine/sequence/builder";
import type { SequenceDef } from "../src/engine/sequence/sequence-def";
import { deserializeEntity } from "../src/engine/serialization/deserialize";
import { serializeEntity } from "../src/engine/serialization/serialize";
import type { World } from "../src/engine/world";
import { SequenceFixture } from "./support/sequence-harness";
import { sequenceSceneConfig } from "./support/sequence-scene";

/**
 * A screen fade is a runtime snapshot's most visible resumable: a save taken
 * while the screen is halfway to black must come back halfway to black and
 * finish the fade, not restart it or snap. Nothing else would surface a
 * regression here — a restarted fade looks like a fade.
 */

const asWorld = (ecs: ECS): World => ({ ecs }) as unknown as World;

test("a part-played tween resumes where it left off after a round-trip", () => {
	const ecs = new ECS();
	const fade = new ScreenFadeComponent(0);
	fade.tween = new Tween(0, 1, 0.4, Ease.Linear);
	fade.tween.tick(0.1 as Seconds);
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
	fade.tween = new Tween(0, 1, 0.3, Ease.Linear);
	fade.tween.tick(0.3 as Seconds);
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

test("an eased tween restores the curve it was saved with", () => {
	const ecs = new ECS();
	const fade = new ScreenFadeComponent(0);
	fade.tween = new Tween(0, 1, 0.4, Ease.OutBack);
	fade.tween.tick(0.3 as Seconds);
	const entity = ecs.createEntity([fade]);
	const valueBefore = fade.tween.value();
	expect(valueBefore).toBeGreaterThan(1);

	const freshEcs = new ECS();
	const restoredId = deserializeEntity(
		asWorld(freshEcs),
		serializeEntity(ecs, entity)!,
	);
	const restored = freshEcs.getComponent(
		restoredId,
		ScreenFadeComponent,
	)!;

	expect(restored.tween!.value()).toBeCloseTo(valueBefore, 6);
});

const FADE_SECONDS = 1;

const FADE_SEQUENCE: SequenceDef = {
	id: "tween-resume",
	class: "exclusive",
	cast: {},
	root: seq(
		"tween-resume.root",
		fadeOp("tween-resume.toBlack", {
			to: 1,
			duration: FADE_SECONDS,
		}),
	),
};

const screenFade = (
	fixture: SequenceFixture,
): ScreenFadeComponent => {
	const entry = fixture.ecs.query(ScreenFadeComponent)[0];
	if (!entry) {
		throw new Error("no screen fade in the world");
	}
	return entry[1];
};

test("a save taken mid-fade restores mid-fade and finishes the fade", async () => {
	const fixture = await SequenceFixture.create(
		sequenceSceneConfig(FADE_SEQUENCE),
	);
	fixture.step(20);

	const saved = screenFade(fixture).alpha;
	expect(saved).toBeGreaterThan(0.2);
	expect(saved).toBeLessThan(0.5);

	await fixture.saveAndReload();

	const restored = screenFade(fixture);
	expect(restored.alpha).toBeCloseTo(saved, 6);
	expect(restored.tween).not.toBeNull();

	fixture.step(1);
	expect(screenFade(fixture).alpha).toBeGreaterThan(saved);

	fixture.step(60);
	expect(screenFade(fixture).alpha).toBe(1);
	expect(screenFade(fixture).tween).toBeNull();

	fixture.dispose();
});
