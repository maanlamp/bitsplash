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
import { Camera2D } from "../engine/camera/camera-2d";
import {
	pickActiveCamera2D,
	renderSceneToTexture,
} from "../engine/camera/camera-2d-render";
import { DebugGridSystem } from "../engine/debug/debug-grid-system";
import Viewport from "../engine/camera/viewport";
import type { World } from "../engine/world";
import { EditorLayer } from "./constants";
import { DEBUG_OVERLAY, type DebugFlags } from "./debug-flags";
import type { EditorState } from "./editor-state";
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
	frameTime = 0;
	fps = 0;
	physicsTime = 0;

	private vsyncEnabled = false;
	private surface: RenderSurface = this.createSurface(
		this.vsyncEnabled,
	);
	private attachedNode: HTMLElement | null = null;

	readonly editorCamera = new Camera2D();

	private readonly camera: EditorCamera2DSystem;
	private readonly entityEditor: EntityEditorSystem;
	private readonly tileEditor: TileEditorSystem;
	private readonly updateSystems: ReadonlyArray<UpdateSystem>;
	private readonly renderSystems: ReadonlyArray<RenderSystem>;

	private detachSurface: (() => void) | null = null;
	private suspended = false;

	constructor(
		readonly id: string,
		readonly document: SceneDocument,
		readonly store: EditorState,
		readonly debugFlags: DebugFlags,
		private readonly services: GlobalServices,
	) {
		this.camera = new EditorCamera2DSystem(store, this.editorCamera);
		this.entityEditor = new EntityEditorSystem(store, this.document);
		this.tileEditor = new TileEditorSystem(store, this.document);
		this.updateSystems = [
			this.camera,
			this.entityEditor,
			this.tileEditor,
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

		this.camera.centerOnContent(this.scene.world.ecs);
	}

	/** The scene this view renders — the one owned by its bound document. */
	get scene(): Scene {
		return this.document.scene;
	}

	/**
	 * Force-commit any open editor gesture (entity drag, tile stroke) so a save
	 * serializes a settled world — a save is a gesture boundary (plan D3).
	 */
	flushGestures(): void {
		this.entityEditor.flush();
		this.tileEditor.flush();
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

	/** The camera this view renders and picks its own edit world with. */
	displayCamera(): Camera2D {
		return this.editorCamera;
	}

	/** Stop stepping this view's per-view editor systems (detached view). */
	suspend(): void {
		this.suspended = true;
	}

	/** Resume stepping this view's per-view editor systems. */
	resume(): void {
		this.suspended = false;
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

	/**
	 * Step this view's edit world one frame. The world ECS runs its own
	 * document/world maintenance systems (the `editorEdit` composition); the
	 * per-view editor systems (camera pan/zoom, entity picking, tile tools) are
	 * stepped here directly against this view's world, input, and camera — they
	 * live outside the ECS flat lists (plan D13). They never step while the view
	 * is suspended.
	 */
	update(dt: Milliseconds, time: Time): void {
		this.input.update();
		const ctx = {
			dt,
			time,
			ecs: this.scene.world.ecs,
			world: this.scene.world,
			input: this.input,
			actions: NULL_ACTIONS,
			assetManager: this.services.assetManager,
			audio: this.services.audio,
			events: this.scene.world.events,
			camera: this.displayCamera(),
		};
		this.scene.world.ecs.update(ctx);
		if (this.suspended) {
			return;
		}
		for (const system of this.updateSystems) {
			system.update(ctx);
		}
	}

	/**
	 * Render this view's edit world. The world ECS renders its own base visuals
	 * (sprites, tilemaps, decorations); the per-view editor overlays (debug
	 * gizmos, entity highlight, tile preview, grid) are rendered here directly
	 * into the same renderer so they composite into their {@link EditorLayer}
	 * bands (plan D13). They are skipped while the view is suspended.
	 */
	render(time: Time): void {
		const renderer = this.renderer;
		if (renderer.width <= 0 || renderer.height <= 0) {
			return;
		}
		const camera = this.displayCamera();
		renderer.beginFrame();
		const ctx = {
			renderer,
			time,
			ecs: this.scene.world.ecs,
			input: this.input,
			assetManager: this.services.assetManager,
			uiScale: this.scene.config.uiScale ?? 1,
			camera,
		};
		this.scene.world.ecs.render(ctx);
		if (!this.suspended) {
			for (const system of this.renderSystems) {
				system.render(ctx);
			}
		}
		const target = renderer.sceneTarget(this.scene);
		renderSceneToTexture(renderer, this.scene, target, camera);
		renderer.composite([target], {
			x: 0,
			y: 0,
			w: renderer.width,
			h: renderer.height,
		});
		renderer.endFrame();
	}

	/**
	 * Render an external world — the run world owned by the {@link RunHost} —
	 * into this viewport with its active game camera (plan D5/D13). The view's
	 * own scene supplies only the clear color, ui scale, and render-target key;
	 * no edit-world state is drawn.
	 */
	renderRunWorld(world: World, time: Time): void {
		const renderer = this.renderer;
		if (renderer.width <= 0 || renderer.height <= 0) {
			return;
		}
		const camera = pickActiveCamera2D(world.ecs);
		renderer.beginFrame();
		world.ecs.render({
			renderer,
			time,
			ecs: world.ecs,
			input: this.input,
			assetManager: this.services.assetManager,
			uiScale: this.scene.config.uiScale ?? 1,
			camera,
		});
		const target = renderer.sceneTarget(this.scene);
		renderSceneToTexture(renderer, this.scene, target, camera);
		renderer.composite([target], {
			x: 0,
			y: 0,
			w: renderer.width,
			h: renderer.height,
		});
		renderer.endFrame();
	}

	dispose(): void {
		this.input.dispose();
		this.detach();
		this.renderer.dispose();
	}
}
