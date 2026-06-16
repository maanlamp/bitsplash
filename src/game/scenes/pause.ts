import { Camera2D } from "../../engine/camera-2d";
import { Camera2DComponent } from "../../engine/components/camera-2d";
import { registerScene } from "../../engine/scene/registry";
import { Scene } from "../../engine/scene/scene";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { DebugTagSystem } from "../../engine/systems/debug-tag";
import { UI_LAYER_MIN } from "../../engine/ui";
import { World } from "../../engine/world";

const DIM_LAYER = UI_LAYER_MIN + 9000;
const TAG_LAYER = 90;

class PauseDimRenderSystem extends RenderSystem {
	render({ renderer }: RenderContext): void {
		renderer.drawRect(DIM_LAYER, {
			x: 0,
			y: 0,
			width: renderer.width,
			height: renderer.height,
			fill: "rgba(0, 0, 0, 0.5)",
		});
	}
}

registerScene("pause", ({ config, name }): Scene => {
	const world = new World(config.gravity);
	const ecs = world.ecs;
	ecs.addRenderSystem(new PauseDimRenderSystem());
	ecs.addRenderSystem(new DebugTagSystem(TAG_LAYER));

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
