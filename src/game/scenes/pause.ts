import { Camera2D } from "../../engine/camera/camera-2d";
import { Camera2DComponent } from "../../engine/camera/camera-2d-component";
import { registerScene } from "../../engine/scene/registry";
import { Scene } from "../../engine/scene/scene";
import { DebugTagSystem } from "../../engine/debug/debug-tag-system";
import { World } from "../../engine/world";

registerScene("pause", ({ config, name }): Scene => {
	const world = new World(config.gravity);
	const ecs = world.ecs;
	ecs.addRenderSystem(new DebugTagSystem("overlay"));

	const camera = new Camera2D();
	camera.zoom = 4;
	ecs.createEntity([new Camera2DComponent(camera, true, 0)]);

	return new Scene({
		kind: "pause",
		name,
		config,
		world,
		gameplaySystems: [],
		spawnRuntimeEntities: () => {},
	});
});
