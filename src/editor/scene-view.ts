import type { Time } from "../engine/clock";
import type { Milliseconds } from "../engine/duration";
import { NULL_ACTIONS } from "../engine/input/bindings/action-provider";
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
import { AiStateDebugSystem } from "./systems/ai-state-debug";
import { NavGraphDebugSystem } from "./systems/nav-graph-debug";
import { PerceptionDebugSystem } from "./systems/perception-debug";
import { PhysicsShapeDebugSystem } from "./systems/physics-shape-debug";
import { TileEditorSystem } from "./systems/tile-editor";
import { TileEditorPreviewSystem } from "./systems/tile-editor-preview";
import { TransformGizmoDebugSystem } from "./systems/transform-gizmo-debug";

type RenderSurface = Readonly<{
	viewport: Viewport;
	renderer: Renderer2D;
	input: Input;
}>;

export class SceneView {
	readonly history = new History();
	readonly document: SceneDocument;

	frameTime = 0;
	fps = 0;
	physicsTime = 0;

	private vsyncEnabled = false;
	private surface: RenderSurface = this.createSurface(
		this.vsyncEnabled,
	);
	private attachedNode: HTMLElement | null = null;

	private readonly camera: EditorCamera2DSystem;
	private readonly updateSystems: ReadonlyArray<UpdateSystem>;
	private readonly renderSystems: ReadonlyArray<RenderSystem>;
	private readonly historyUnsub: () => void;

	private detachSurface: (() => void) | null = null;
	private suspended = false;
	private savedCameraView: Readonly<{
		x: number;
		y: number;
		zoom: number;
	}> | null = null;

	constructor(
		readonly id: string,
		readonly scene: Scene,
		readonly store: EditorState,
		readonly debugFlags: DebugFlags,
		private readonly services: GlobalServices,
	) {
		this.camera = new EditorCamera2DSystem(store);
		this.updateSystems = [
			this.camera,
			new EntityEditorSystem(store, this.history),
			new TileEditorSystem(store, this.history),
		];
		this.renderSystems = [
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
			new NavGraphDebugSystem(
				debugFlags,
				store,
				EditorLayer.DEBUG_OVERLAY,
			),
			new PerceptionDebugSystem(
				debugFlags,
				EditorLayer.DEBUG_OVERLAY,
			),
			new AiStateDebugSystem(debugFlags, EditorLayer.DEBUG_OVERLAY),
			new EntityHighlightSystem(store, EditorLayer.EDITOR_PREVIEW),
			new TileEditorPreviewSystem(EditorLayer.EDITOR_PREVIEW, store),
			new DebugGridSystem(EditorLayer.DEBUG_GRID),
		];

		this.history.world = scene.world;
		this.addSystems();
		this.camera.ensure(scene.world.ecs);

		this.document = new SceneDocument(scene);
		this.historyUnsub = this.history.subscribe(() =>
			this.document.markDirty(),
		);
	}

	get viewport(): Viewport {
		return this.surface.viewport;
	}

	get renderer(): Renderer2D {
		return this.surface.renderer;
	}

	get input(): Input {
		return this.surface.input;
	}

	get vsync(): boolean {
		return this.vsyncEnabled;
	}

	private createSurface(vsync: boolean): RenderSurface {
		const viewport = new Viewport();
		const renderer = new Renderer2D(viewport, vsync);
		const input = new Input(viewport.element);
		return { viewport, renderer, input };
	}

	setVsync(enabled: boolean): void {
		if (this.vsyncEnabled === enabled) {
			return;
		}
		this.vsyncEnabled = enabled;
		const node = this.attachedNode;
		this.detach();
		this.surface.input.dispose();
		this.surface.renderer.dispose();
		this.surface = this.createSurface(enabled);
		if (node) {
			this.attach(node);
		}
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
		this.captureCameraView();
		this.removeSystems();
		this.camera.setActive(false);
	}

	resume(): void {
		if (!this.suspended) {
			return;
		}
		this.suspended = false;
		this.addSystems();
		this.restoreCameraView();
		this.camera.setActive(true);
	}

	captureCameraView(): void {
		this.savedCameraView = this.camera.viewState();
	}

	restoreCameraView(): void {
		const ecs = this.scene.world.ecs;
		if (this.savedCameraView) {
			this.camera.applyView(ecs, this.savedCameraView);
		} else {
			this.camera.ensure(ecs);
		}
		this.savedCameraView = null;
	}

	setCameraActive(active: boolean): void {
		this.camera.setActive(active);
	}

	runUpdate(
		dt: Milliseconds,
		time: Time,
		editorInput: Input,
		gameInput: Input,
	): void {
		const ecs = this.scene.world.ecs;
		const actions = this.scene.actions ?? NULL_ACTIONS;
		actions.step(gameInput, dt);
		const base = {
			dt,
			time,
			ecs,
			world: this.scene.world,
			assetManager: this.services.assetManager,
			audio: this.services.audio,
			events: this.scene.world.events,
		};
		ecs.update({
			...base,
			input: editorInput,
			actions: NULL_ACTIONS,
		});
		this.scene.updateGameplay({ ...base, input: gameInput, actions });
	}

	stepGameplayOnce(dt: Milliseconds, time: Time, input: Input): void {
		this.scene.world.requestSingleStep();
		const actions = this.scene.actions ?? NULL_ACTIONS;
		actions.step(input, dt);
		this.scene.stepGameplay({
			dt,
			time,
			ecs: this.scene.world.ecs,
			world: this.scene.world,
			input,
			actions,
			assetManager: this.services.assetManager,
			audio: this.services.audio,
			events: this.scene.world.events,
		});
	}

	attach(node: HTMLElement): void {
		this.detachSurface?.();
		this.attachedNode = node;
		this.viewport.element.style.outline = "none";
		this.detachSurface = this.viewport.attach(node);
	}

	detach(): void {
		this.detachSurface?.();
		this.detachSurface = null;
		this.attachedNode = null;
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
			actions: NULL_ACTIONS,
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
			uiScale: this.scene.config.uiScale ?? 1,
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
