import { expect, test } from "bun:test";
import { Camera2D } from "../src/engine/camera/camera-2d";
import { Camera2DComponent } from "../src/engine/camera/camera-2d-component";
import { EditorCameraTagComponent } from "../src/engine/camera/editor-camera-tag-component";
import { Camera2DFollowComponent } from "../src/engine/camera/camera-2d-follow-component";
import { ECS } from "../src/engine/ecs";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import type { World } from "../src/engine/world";
import { spawnCamera2D } from "../src/game/spawn-camera-2d";

const asWorld = (ecs: ECS): World => ({ ecs }) as unknown as World;

test("spawnCamera2D creates a follow camera when none exists", () => {
	const ecs = new ECS();
	const player = ecs.createEntity([
		new TransformComponent(new Vector2(3, 4)),
	]);
	const id = spawnCamera2D(asWorld(ecs), { target: player });
	expect(
		ecs.getComponent(id, Camera2DFollowComponent)?.targets,
	).toEqual([player]);
});

test("spawnCamera2D configures an existing follow-less game camera without duplicating", () => {
	const ecs = new ECS();
	const player = ecs.createEntity([
		new TransformComponent(new Vector2(3, 4)),
	]);
	const gameCamera = ecs.createEntity([
		new Camera2DComponent(new Camera2D(), true, 0),
	]);
	const id = spawnCamera2D(asWorld(ecs), { target: player });
	expect(id).toBe(gameCamera);
	expect(ecs.query(Camera2DComponent).length).toBe(1);
	expect(
		ecs.getComponent(id, Camera2DFollowComponent)?.targets,
	).toEqual([player]);
});

test("spawnCamera2D ignores the editor camera and spawns a separate game camera", () => {
	const ecs = new ECS();
	const player = ecs.createEntity([
		new TransformComponent(new Vector2(3, 4)),
	]);
	const editorCamera = ecs.createEntity([
		new Camera2DComponent(new Camera2D(), true, 100),
		new EditorCameraTagComponent(),
	]);
	const id = spawnCamera2D(asWorld(ecs), { target: player });
	expect(id).not.toBe(editorCamera);
	expect(ecs.query(Camera2DComponent).length).toBe(2);
	expect(
		ecs.getComponent(editorCamera, Camera2DFollowComponent),
	).toBeUndefined();
	expect(
		ecs.getComponent(id, Camera2DFollowComponent)?.targets,
	).toEqual([player]);
});

test("spawnCamera2D leaves an already-configured camera untouched", () => {
	const ecs = new ECS();
	const player = ecs.createEntity([
		new TransformComponent(new Vector2(3, 4)),
	]);
	const first = spawnCamera2D(asWorld(ecs), { target: player });
	const second = spawnCamera2D(asWorld(ecs), { target: player });
	expect(second).toBe(first);
	expect(ecs.query(Camera2DComponent).length).toBe(1);
});
