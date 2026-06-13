import type { Camera2D } from "../camera-2d";
import { Camera2DComponent } from "../components/camera-2d";
import type { ReadonlyECS } from "../ecs";
import type Renderer2D from "../renderer-2d";
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

export const renderActiveCamera = (
	renderer: Renderer2D,
	ecs: ReadonlyECS,
	uiScale = 1,
): void => {
	const camera = pickActiveCamera2D(ecs);
	const vw = renderer.width;
	const vh = renderer.height;
	if (!camera || vw <= 0 || vh <= 0 || camera.zoom <= 0) {
		return;
	}
	camera.viewportWidth = vw;
	camera.viewportHeight = vh;

	const z = camera.zoom;
	if (!camera.target) {
		camera.target = renderer.createRenderTarget();
	}
	camera.target.resize(vw, vh);

	const spanX = vw / z;
	const spanY = vh / z;
	camera.target.setSpan(spanX, spanY);

	const snappedX =
		Math.round((camera.position.x + camera.shake.x) * z) / z;
	const snappedY =
		Math.round((camera.position.y + camera.shake.y) * z) / z;
	camera.target.setOrigin(snappedX - spanX / 2, snappedY - spanY / 2);

	renderer.renderTo(camera.target, (id) => id < UI_LAYER_MIN);
	renderer.present(camera.target, { x: 0, y: 0, w: vw, h: vh });
	renderer.renderUiOverlay(UI_LAYER_MIN, uiScale);
};
