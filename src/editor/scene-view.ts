import type { Time } from "../engine/clock";
import type { Milliseconds } from "../engine/duration";
import { Input } from "../engine/input/input";
import Renderer2D from "../engine/render/renderer-2d";
import type { Scene } from "../engine/scene/scene";
import type { GlobalServices } from "../engine/services";
import {
	type RenderSystem,
	type UpdateSystem,
} from "../engine/system";
import { renderSceneToTexture } from "../engine/camera/camera-2d-render";
import { DebugGridSystem } from "../engine/debug/debug-grid-system";
import Viewport from "../engine/camera/viewport";
import { EditorLayer } from "./constants";
import { DEBUG_OVERLAY, type DebugFlags } from "./debug-flags";
import type { EditorState } from "./editor-state";
import { History } from "./history";
import { SceneDocument } from "./scene-document";
import { EditorCamera2DSystem } from "./systems/editor-camera-2d";
import { EntityEditorSystem } from "./systems/entity-editor";
import { EntityHighlightSystem } from "./systems/entity-highlight";
import { PhysicsShapeDebugSystem } from "./systems/physics-shape-debug";
import { TileEditorSystem } from "./systems/tile-editor";
import { TileEditorPreviewSystem } from "./systems/tile-editor-preview";
import { TransformGizmoDebugSystem } from "./systems/transform-gizmo-debug";

export class SceneView {
	readonly viewport = new Viewport();
	readonly renderer = new Renderer2D(this.viewport);
	readonly input = new Input(this.viewport.element);
	readonly history = new History();
	readonly document: SceneDocument;

	frameTime = 0;
	fps = 0;
	physicsTime = 0;

	private readonly camera: EditorCamera2DSystem;
	private readonly updateSystems: ReadonlyArray<UpdateSystem>;
	private readonly renderSystems: ReadonlyArray<RenderSystem>;
	private readonly historyUnsub: () => void;

	private detachSurface: (() => void) | null = null;
	private suspended = false;

	constructor(
		readonly id: string,
		readonly scene: Scene,
		readonly store: EditorState,
		readonly debugFlags: DebugFlags,
		private readonly services: GlobalServices,
	) {
		const grid = scene.tileGrid ?? null;
		this.camera = new EditorCamera2DSystem(grid, store);
		const updateSystems: UpdateSystem[] = [
			this.camera,
			new EntityEditorSystem(store, this.history),
		];
		const renderSystems: RenderSystem[] = [
			new PhysicsShapeDebugSystem(
				debugFlags,
				DEBUG_OVERLAY.colliders,
				"collider",
				EditorLayer.DEBUG_OVERLAY,
			),
			new PhysicsShapeDebugSystem(
				debugFlags,
				DEBUG_OVERLAY.sensors,
				"sensor",
				EditorLayer.DEBUG_OVERLAY,
			),
			new TransformGizmoDebugSystem(
				debugFlags,
				DEBUG_OVERLAY.transforms,
				EditorLayer.DEBUG_OVERLAY,
			),
			new EntityHighlightSystem(store, EditorLayer.EDITOR_PREVIEW),
		];
		if (grid) {
			updateSystems.push(
				new TileEditorSystem(grid, store, this.history),
			);
			renderSystems.push(
				new TileEditorPreviewSystem(
					grid,
					EditorLayer.EDITOR_PREVIEW,
					store,
				),
				new DebugGridSystem(EditorLayer.DEBUG_GRID),
			);
		}
		this.updateSystems = updateSystems;
		this.renderSystems = renderSystems;

		this.addSystems();
		this.camera.ensure(scene.world.ecs);

		this.document = new SceneDocument(scene);
		this.historyUnsub = this.history.subscribe(() =>
			this.document.markDirty(),
		);
	}

	private addSystems(): void {
		const ecs = this.scene.world.ecs;
		for (const system of this.updateSystems) {
			ecs.addUpdateSystem(system);
		}
		for (const system of this.renderSystems) {
			ecs.addRenderSystem(system);
		}
	}

	private removeSystems(): void {
		const ecs = this.scene.world.ecs;
		for (const system of this.updateSystems) {
			ecs.removeUpdateSystem(system);
		}
		for (const system of this.renderSystems) {
			ecs.removeRenderSystem(system);
		}
	}

	suspend(): void {
		if (this.suspended) {
			return;
		}
		this.suspended = true;
		this.removeSystems();
		this.camera.setActive(false);
	}

	resume(): void {
		if (!this.suspended) {
			return;
		}
		this.suspended = false;
		this.addSystems();
		this.camera.ensure(this.scene.world.ecs);
		this.camera.setActive(true);
	}

	attach(node: HTMLElement): void {
		this.detachSurface?.();
		this.viewport.element.style.outline = "none";
		this.detachSurface = this.viewport.attach(node);
	}

	detach(): void {
		this.detachSurface?.();
		this.detachSurface = null;
	}

	rollInput(): void {
		this.input.update();
	}

	update(dt: Milliseconds, time: Time): void {
		this.input.update();
		this.scene.world.ecs.update({
			dt,
			time,
			ecs: this.scene.world.ecs,
			world: this.scene.world,
			input: this.input,
			assetManager: this.services.assetManager,
			audio: this.services.audio,
			events: this.scene.world.events,
		});
	}

	render(time: Time): void {
		const renderer = this.renderer;
		if (renderer.width <= 0 || renderer.height <= 0) {
			return;
		}
		renderer.beginFrame();
		this.scene.world.ecs.render({
			renderer,
			time,
			ecs: this.scene.world.ecs,
			input: this.input,
			assetManager: this.services.assetManager,
		});
		const target = renderer.sceneTarget(this.scene);
		renderSceneToTexture(renderer, this.scene, target);
		renderer.composite([target], {
			x: 0,
			y: 0,
			w: renderer.width,
			h: renderer.height,
		});
		renderer.endFrame();
	}

	dispose(): void {
		if (!this.suspended) {
			this.removeSystems();
		}
		this.historyUnsub();
		this.input.dispose();
		this.detach();
		this.renderer.dispose();
	}
}
