import type AssetManager from "../assets";
import type { Camera2D } from "../camera/camera-2d";
import { renderSceneToTexture } from "../camera/camera-2d-render";
import type { Time } from "../clock";
import type { Input } from "../input/input";
import type { Scene } from "../scene/scene";
import type { RenderContext, RenderSystem } from "../system";
import type { World } from "../world";
import type { FrameScope } from "./frame-scope";

/**
 * What a view presents a world *as*: the scene whose config drives the
 * composite, and the key its render target is cached under. Both come from the
 * presenting view, which is not always the world being drawn — the editor's run
 * view draws the run world through its own scene.
 */
export type WorldPresentation = Readonly<{
	/** Supplies clear colour and post chain to `renderSceneToTexture`. */
	scene: Scene;
	/** Identity the scene render target is cached under (`Renderer2D.sceneTarget`). */
	targetKey: object;
}>;

export type RenderWorldOptions = Readonly<{
	world: World;
	camera: Camera2D | null;
	time: Time;
	input: Input;
	assetManager: AssetManager;
	uiScale: number;
	/** Per-view overlay systems drawn into the same renderer after the world's own. */
	overlays?: ReadonlyArray<RenderSystem> | null;
	presentation: WorldPresentation;
}>;

/**
 * Draw one world for one frame: its own render systems, then the caller's
 * overlays, then the collected commands composited through `presentation`.
 *
 * The single render path shared by the game host and the editor's views. It
 * lives here rather than on {@link import("./renderer-2d").default} so the
 * renderer stays ignorant of worlds, and takes a {@link FrameScope} so it can
 * only run inside a `Renderer2D.frame` bracket.
 *
 * @example
 * renderer.frame((scope) => {
 * 	renderWorld(scope, {
 * 		world,
 * 		camera: pickActiveCamera2D(world.ecs),
 * 		time,
 * 		input,
 * 		assetManager,
 * 		uiScale: scene.config.uiScale ?? 1,
 * 		presentation: { scene, targetKey: scene },
 * 	});
 * });
 */
export const renderWorld = (
	scope: FrameScope,
	options: RenderWorldOptions,
): void => {
	const { world, camera, overlays, presentation } = options;
	const ctx: RenderContext = {
		renderer: scope.renderer,
		time: options.time,
		ecs: world.ecs,
		input: options.input,
		assetManager: options.assetManager,
		uiScale: options.uiScale,
		camera,
	};
	world.ecs.render(ctx);
	if (overlays) {
		for (const system of overlays) {
			system.render(ctx);
		}
	}
	const target = scope.sceneTarget(presentation.targetKey);
	renderSceneToTexture(
		ctx.renderer,
		presentation.scene,
		target,
		camera,
	);
	scope.composite([target], {
		x: 0,
		y: 0,
		w: scope.width,
		h: scope.height,
	});
};
