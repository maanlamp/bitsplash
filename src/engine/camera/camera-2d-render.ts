import type { Camera2D } from "../camera/camera-2d";
import { Camera2DComponent } from "../camera/camera-2d-component";
import type { ReadonlyECS } from "../ecs";
import type Renderer2D from "../render/renderer-2d";
import type { RenderTarget } from "../render/render-target";
import type { Scene } from "../scene/scene";
import { UI_LAYER_MIN } from "../ui";

export const pickActiveCamera2D = (
	ecs: ReadonlyECS,
): Camera2D | null => {
	let best: Camera2DComponent | null = null;
	for (const [, component] of ecs.query(Camera2DComponent)) {
		if (!component.active) {
			continue;
		}
		if (!best || component.priority > best.priority) {
			best = component;
		}
	}
	return best ? best.camera : null;
};

export const renderSceneToTexture = (
	renderer: Renderer2D,
	scene: Scene,
	target: RenderTarget,
): void => {
	const vw = renderer.width;
	const vh = renderer.height;
	if (vw <= 0 || vh <= 0) {
		return;
	}
	target.resize(vw, vh);

	const camera = pickActiveCamera2D(scene.world.ecs);
	let drewWorld = false;
	if (camera && camera.zoom > 0) {
		camera.viewportWidth = vw;
		camera.viewportHeight = vh;
		const z = camera.zoom;
		const spanX = vw / z;
		const spanY = vh / z;
		target.setSpan(spanX, spanY);
		const snappedX =
			Math.round((camera.position.x + camera.shake.x) * z) / z;
		const snappedY =
			Math.round((camera.position.y + camera.shake.y) * z) / z;
		target.setOrigin(snappedX - spanX / 2, snappedY - spanY / 2);
		renderer.renderTo(target, (id) => id < UI_LAYER_MIN, true);
		drewWorld = true;
	}

	const uiScale = scene.config.uiScale ?? 1;
	target.setSpan(vw / uiScale, vh / uiScale);
	target.setOrigin(0, 0);
	renderer.renderTo(target, (id) => id >= UI_LAYER_MIN, !drewWorld);
};
