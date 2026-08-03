import { expect, test } from "bun:test";
import { Ease } from "../src/engine/animation/ease";
import { Tween } from "../src/engine/animation/tween";
import { Camera2D } from "../src/engine/camera/camera-2d";
import { Camera2DComponent } from "../src/engine/camera/camera-2d-component";
import { Camera2DFollowComponent } from "../src/engine/camera/camera-2d-follow-component";
import { CameraTransitionComponent } from "../src/engine/camera/camera-transition-component";
import { CameraTransitionSystem } from "../src/engine/camera/camera-transition-system";
import type { Seconds } from "../src/engine/duration";
import { ECS } from "../src/engine/ecs";
import { ScreenFadeComponent } from "../src/engine/fade/screen-fade-component";
import { deserializeEntity } from "../src/engine/serialization/deserialize";
import { serializeEntity } from "../src/engine/serialization/serialize";
import type { UpdateContext } from "../src/engine/system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import type { World } from "../src/engine/world";
import { spawnCamera2D } from "../src/game/spawn-camera-2d";

const asWorld = (ecs: ECS): World => ({ ecs }) as unknown as World;

test("camera + follow + transition survive a save/restore round-trip", () => {
	const ecs = new ECS();
	const world = asWorld(ecs);
	const targetId = ecs.createEntity([
		new TransformComponent(new Vector2(10, 20)),
	]);
	const cameraId = spawnCamera2D(world, { target: targetId });

	const cameraComp = ecs.getComponent(cameraId, Camera2DComponent)!;
	cameraComp.camera.position.set(123, 456);
	cameraComp.camera.zoom = 5;
	cameraComp.priority = 2;

	const follow = ecs.getComponent(cameraId, Camera2DFollowComponent)!;
	follow.targets = [targetId];
	follow.zoom = 5;

	const transition = new CameraTransitionComponent({
		target: new Vector2(7, 8),
		mode: "glide",
		zoom: 2,
		followAfter: [targetId],
	});
	transition.glide.tick(0.3 as Seconds);
	transition.fromPosition = new Vector2(1, 2);
	transition.fromZoom = 3;
	transition.phase = "glide";
	ecs.addComponent(cameraId, transition);

	const before = serializeEntity(ecs, cameraId)!;

	const freshEcs = new ECS();
	const restoredId = deserializeEntity(asWorld(freshEcs), before);
	const after = serializeEntity(freshEcs, restoredId)!;

	expect(after).toEqual(before);

	const rCamera = freshEcs.getComponent(
		restoredId,
		Camera2DComponent,
	)!;
	expect(rCamera.camera).toBeInstanceOf(Camera2D);
	expect(rCamera.camera.position.x).toBe(123);
	expect(rCamera.camera.position.y).toBe(456);
	expect(rCamera.camera.zoom).toBe(5);
	expect(rCamera.priority).toBe(2);

	const rFollow = freshEcs.getComponent(
		restoredId,
		Camera2DFollowComponent,
	)!;
	expect(rFollow.targets).toEqual([targetId]);
	expect(rFollow.zoom).toBe(5);

	const rTransition = freshEcs.getComponent(
		restoredId,
		CameraTransitionComponent,
	)!;
	expect(rTransition.fromPosition).toBeInstanceOf(Vector2);
	expect(rTransition.fromPosition!.x).toBe(1);
	expect(rTransition.glide.elapsed as number).toBe(0.3);
	expect(rTransition.followAfter).toEqual([targetId]);
	expect(rTransition.fade).toBeNull();

	const countBefore = freshEcs.entities().length;
	const respawned = spawnCamera2D(asWorld(freshEcs), {
		target: targetId,
	});
	expect(respawned).toBe(restoredId);
	expect(freshEcs.entities().length).toBe(countBefore);
});

test("screen fade tween survives a save/restore round-trip", () => {
	const ecs = new ECS();
	const fade = new ScreenFadeComponent(0.5);
	fade.tween = new Tween(0, 1, 0.5, Ease.Linear);
	const fadeId = ecs.createEntity([fade]);

	const before = serializeEntity(ecs, fadeId)!;
	const freshEcs = new ECS();
	const restoredId = deserializeEntity(asWorld(freshEcs), before);
	const after = serializeEntity(freshEcs, restoredId)!;

	expect(after).toEqual(before);

	const rFade = freshEcs.getComponent(
		restoredId,
		ScreenFadeComponent,
	)!;
	expect(rFade.alpha).toBe(0.5);
	expect(rFade.tween).toBeInstanceOf(Tween);
	expect(rFade.tween!.to).toBe(1);
});

test("a restored cut transition with fade === null re-arms instead of erroring", () => {
	const ecs = new ECS();
	const world = asWorld(ecs);
	const targetId = ecs.createEntity([
		new TransformComponent(new Vector2(0, 0)),
	]);
	const cameraId = spawnCamera2D(world, { target: targetId });

	const transition = new CameraTransitionComponent({
		target: new Vector2(50, 60),
		mode: "cut",
	});
	transition.phase = "out";
	transition.fade = { done: () => false, complete: () => {} };
	ecs.addComponent(cameraId, transition);

	const before = serializeEntity(ecs, cameraId)!;
	const freshEcs = new ECS();
	const restoredId = deserializeEntity(asWorld(freshEcs), before);

	const restored = freshEcs.getComponent(
		restoredId,
		CameraTransitionComponent,
	)!;
	expect(restored.fade).toBeNull();
	expect(restored.phase).toBe("out");

	const system = new CameraTransitionSystem();
	const ctx = {
		ecs: freshEcs,
		time: { dt: 0 },
	} as unknown as UpdateContext;
	expect(() => system.update(ctx)).not.toThrow();

	expect(restored.phase).toBe("in");
	const rCamera = freshEcs.getComponent(
		restoredId,
		Camera2DComponent,
	)!;
	expect(rCamera.camera.position.x).toBe(50);
	expect(rCamera.camera.position.y).toBe(60);
});
