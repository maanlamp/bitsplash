import { expect, test } from "bun:test";
import { Camera2D } from "../src/engine/camera/camera-2d";
import { Camera2DComponent } from "../src/engine/camera/camera-2d-component";
import { EditorCameraTagComponent } from "../src/engine/camera/editor-camera-tag-component";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { Scene, SceneConfig } from "../src/engine/scene/scene";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";

type RapierModule = typeof import("@dimforge/rapier2d");

const loadRapierHeadless = (): Promise<void> =>
	loadRapier(async () => {
		const mod =
			(await import("@dimforge/rapier2d-compat")) as unknown as {
				init: () => Promise<void>;
			};
		await mod.init();
		return mod as unknown as RapierModule;
	});

test("setSimulating snapshot excludes the editor camera but keeps authored entities", async () => {
	await loadRapierHeadless();
	const config = new SceneConfig();
	const world = new World(config.gravity);
	const editorCamera = world.ecs.createEntity([
		new Camera2DComponent(new Camera2D(), true, 100),
		new EditorCameraTagComponent(),
	]);
	const authored = world.ecs.createEntity([
		new TransformComponent(new Vector2(1, 2)),
	]);

	const scene = new Scene({
		kind: "test",
		name: "test",
		config,
		world,
		gameplaySystems: [],
	});
	scene.setSimulating(true);

	const snapshot = scene.snapshotData ?? [];
	expect(snapshot.some((entity) => entity.id === editorCamera)).toBe(
		false,
	);
	expect(snapshot.some((entity) => entity.id === authored)).toBe(
		true,
	);
});
