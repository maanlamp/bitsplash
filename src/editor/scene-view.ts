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
import { pickActiveCamera2D } from "../engine/camera/camera-2d-render";
import { renderWorld } from "../engine/render/render-world";
import {
	CursorAuthority,
	type CursorToken,
} from "../engine/cursor/cursor-authority";
import { activeTileLayer } from "./active-layer";
import { disposePickIndex } from "./pick-index";
import { DebugGridSystem } from "../engine/debug/debug-grid-system";
import Viewport from "../engine/camera/viewport";
import type { World } from "../engine/world";
import { EditorLayer } from "./constants";
import { DEBUG_OVERLAY, type DebugFlags } from "./debug-flags";
import { PerfHistory } from "./perf/perf-history";
import type { EditorState } from "./editor-state";
import { SceneDocument } from "./scene-document";
import { EditorCamera2DSystem } from "./systems/editor-camera-2d";
import { EntityAabbSystem } from "./systems/entity-aabb";
import { EntityEditorSystem } from "./systems/entity-editor";
import { EntityHighlightSystem } from "./systems/entity-highlight";
import { ManipulationOverlaySystem } from "./systems/manipulation-overlay";
import { AiStateDebugSystem } from "./systems/ai-state-debug";
import { NavGraphDebugSystem } from "./systems/nav-graph-debug";
import { PerceptionDebugSystem } from "./systems/perception-debug";
import { PhysicsShapeDebugSystem } from "./systems/physics-shape-debug";
import { TileEditorSystem } from "./systems/tile-editor";
import { TileEditorPreviewSystem } from "./systems/tile-editor-preview";
import { TransformGizmoDebugSystem } from "./systems/transform-gizmo-debug";
import { WeatherPreviewStore } from "./weather/weather-preview-store";
import type { AudioBus } from "../engine/audio/audio-bus";
import { audioFocus } from "../engine/audio/audio-focus";
import { editorMainBus } from "./audio/editor-buses";

type RenderSurface = Readonly<{
	viewport: Viewport;
	renderer: Renderer2D;
	input: Input;
}>;

export class SceneView {
	frameTime = 0;
	fps = 0;
	readonly perf = new PerfHistory();

	private surface: RenderSurface = this.createSurface();

	readonly editorCamera = new Camera2D();

	/**
	 * This view's weather preview scrub. Per view because the preview is per
	 * world; the store is the only writer of this world's preview entry.
	 */
	readonly weatherPreview: WeatherPreviewStore;

	/**
	 * This view's own bus. The per-view mute toggle drives it, and nothing else
	 * does — the audio-focus gate lives one level down on {@link worldBus}, so a
	 * view that is muted and a view that is merely unattended cannot overwrite
	 * each other's decision.
	 */
	readonly audioBus: AudioBus;

	private silenced = false;

	/**
	 * Where worlds shown in this view hang their audio: the edit world, and the
	 * run world while a run is anchored here. Muted unless this view is the one
	 * the user is attending to.
	 */
	readonly worldBus: AudioBus;

	private readonly detachAudio: ReadonlyArray<() => void>;

	private readonly camera: EditorCamera2DSystem;
	private readonly entityEditor: EntityEditorSystem;
	private readonly tileEditor: TileEditorSystem;
	private readonly updateSystems: ReadonlyArray<UpdateSystem>;
	private readonly renderSystems: ReadonlyArray<RenderSystem>;

	private detachSurface: (() => void) | null = null;
	private cursorAuthority: CursorAuthority | null = null;
	private cursorToken: CursorToken | null = null;
	private suspended = false;
	private prewarmCanvas: HTMLCanvasElement | null = null;
	private mountedNode: HTMLElement | null = null;

	constructor(
		readonly id: string,
		readonly document: SceneDocument,
		readonly store: EditorState,
		readonly debugFlags: DebugFlags,
		private readonly services: GlobalServices,
	) {
		this.weatherPreview = new WeatherPreviewStore(
			this.scene.world.ecs,
		);
		this.audioBus = services.audio.createBus(
			editorMainBus(services.audio),
		);
		this.worldBus = services.audio.createBus(this.audioBus);
		this.scene.world.attachAudio(services.audio, this.worldBus);
		this.detachAudio = [audioFocus.gate(this.worldBus, id)];
		this.camera = new EditorCamera2DSystem(store, this.editorCamera);
		this.entityEditor = new EntityEditorSystem(store, this.document);
		this.tileEditor = new TileEditorSystem(store, this.document);
		this.document.bindSelection({
			capture: () => store.snapshot(),
			restore: (snap) => store.restore(snap),
		});
		this.updateSystems = [
			this.camera,
			new EntityAabbSystem(),
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
			new ManipulationOverlaySystem(
				this.entityEditor,
				EditorLayer.EDITOR_PREVIEW,
			),
			new TileEditorPreviewSystem(EditorLayer.EDITOR_PREVIEW, store),
			new DebugGridSystem(EditorLayer.DEBUG_GRID),
		];

		this.scene.world.setProfiling(true);
		this.camera.centerOnContent(this.scene.world.ecs);
		this.selectDefaultLayer();
	}

	/**
	 * On first mount, reflect the effective paint target in the layers panel:
	 * with no layer explicitly selected, adopt the first tile layer (the same
	 * fallback {@link activeTileLayer} paints through) so a freshly opened scene
	 * shows a selected layer instead of an ambiguous none.
	 */
	private selectDefaultLayer(): void {
		if (this.store.activeLayer !== null) {
			return;
		}
		const active = activeTileLayer(this.scene.world.ecs, this.store);
		if (active) {
			this.store.setActiveLayer(active[0]);
		}
	}

	/** The scene this view renders — the one owned by its bound document. */
	get scene(): Scene {
		return this.document.scene;
	}

	/**
	 * Mute or unmute everything this view can make audible — its edit world, and
	 * a run anchored here.
	 *
	 * Drives {@link audioBus}, one level above the audio-focus gate on
	 * {@link worldBus}, so muting a view and attending to a different one are
	 * independent decisions rather than the same node written twice. The asset
	 * preview bus is a sibling of this whole subtree, so the audio editor keeps
	 * sounding regardless.
	 */
	setMuted(muted: boolean): void {
		if (this.silenced === muted) {
			return;
		}
		this.silenced = muted;
		this.audioBus.mute(muted);
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

	private createSurface(): RenderSurface {
		const viewport = new Viewport();
		const renderer = new Renderer2D(viewport);
		const input = new Input(viewport.element);
		return { viewport, renderer, input };
	}

	/**
	 * Pre-bake this view's renderer GPU state into `doc` ahead of a cross-window
	 * move into that window (called during the ghost drag). A canvas is created
	 * in `doc` and the renderer re-bakes its tile arrays into a context on it —
	 * the dominant upload cost — so the drop-frame {@link attach} adopts the
	 * warmed context instead of baking. A no-op if already warmed for `doc`.
	 */
	prewarmMove(doc: Document): void {
		if (this.prewarmCanvas?.ownerDocument === doc) {
			return;
		}
		const canvas = doc.createElement("canvas");
		this.prewarmCanvas = canvas;
		this.renderer.prewarm(canvas);
	}

	/** Drop a pending {@link prewarmMove} (move cancelled, snapped home). */
	cancelPrewarmMove(): void {
		if (!this.prewarmCanvas) {
			return;
		}
		this.prewarmCanvas = null;
		this.renderer.cancelPrewarm();
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

	/**
	 * Mount this view's canvas into `node`. When `node` lives in a **different
	 * document** than the current canvas — a cross-window move — a WebGL canvas
	 * cannot survive `adoptNode`, so the viewport recreates the canvas in the
	 * destination document ({@link Viewport.reattach}, adopting a pre-warmed
	 * canvas from {@link prewarmMove} when present), the renderer reacquires its
	 * GL context ({@link Renderer2D.rebuild}, which fires `onContextRestored` so
	 * external GL holders rebuild), and input + the cursor authority are rebound
	 * to the fresh canvas. Same-document mounts take the cheap `attach` path.
	 */
	attach(node: HTMLElement): void {
		// Compare the canvas's own document, not a remembered one: a view whose
		// first-ever mount is into a satellite still needs the reattach path (the
		// canvas is born in the hub document), otherwise `appendChild` would adopt
		// it cross-document and silently kill the GL context.
		const crossDocument =
			this.viewport.element.ownerDocument !== node.ownerDocument;
		this.detachSurface?.();
		this.viewport.element.style.outline = "none";
		if (crossDocument) {
			const warmed =
				this.prewarmCanvas?.ownerDocument === node.ownerDocument
					? this.prewarmCanvas
					: undefined;
			this.prewarmCanvas = null;
			this.detachSurface = this.viewport.reattach(node, warmed);
			this.renderer.rebuild();
			this.rebindInput();
		} else {
			this.detachSurface = this.viewport.attach(node);
		}
		this.cursorAuthority = new CursorAuthority(this.viewport.element);
		this.cursorToken = this.cursorAuthority.request("default");
		this.mountedNode = node;
	}

	/**
	 * Unmount this view **only if** `node` is still the container it is mounted
	 * in. A cross-window move remounts this view in two independent React roots:
	 * the destination window mounts (calling {@link attach}) before the source
	 * window's now-stale subtree unmounts. Without this guard the stale unmount's
	 * {@link detach} would tear down the freshly attached destination surface —
	 * removing the just-mounted canvas and leaving the view blank (the
	 * satellite→hub move regression). Comparing the container node makes the stale
	 * unmount a no-op while a genuine close still tears down.
	 */
	detachIfCurrent(node: HTMLElement): void {
		if (this.mountedNode === node) {
			this.detach();
		}
	}

	/**
	 * Rebind input to the current `viewport.element` after a cross-window move.
	 * The old {@link Input} held DOM listeners on the now-discarded canvas; it is
	 * disposed and a fresh one is created against the new canvas.
	 */
	private rebindInput(): void {
		this.surface.input.dispose();
		this.surface = {
			...this.surface,
			input: new Input(this.viewport.element),
		};
	}

	detach(): void {
		this.mountedNode = null;
		this.detachSurface?.();
		this.detachSurface = null;
		this.cursorToken?.dispose();
		this.cursorToken = null;
		this.cursorAuthority?.dispose();
		this.cursorAuthority = null;
	}

	/**
	 * The cursor this view wants right now. Only panning changes it: pan mode
	 * reads `grab` (the authority upgrades to `grabbing` while the button is
	 * pressed). Every other interaction keeps the default cursor.
	 */
	private desiredCursor(): string {
		if (this.store.mode === "pan") {
			return "grab";
		}
		return "default";
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
		this.cursorToken?.update(this.desiredCursor());
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
		renderer.frame((scope) => {
			renderWorld(scope, {
				world: this.scene.world,
				camera: this.displayCamera(),
				time,
				input: this.input,
				assetManager: this.services.assetManager,
				uiScale: this.scene.config.uiScale ?? 1,
				overlays: this.suspended ? null : this.renderSystems,
				presentation: {
					scene: this.scene,
					targetKey: this.scene,
				},
			});
		});
	}

	/**
	 * Render an external world — the run world owned by the {@link RunHost} —
	 * into this viewport with its active game camera (plan D5/D13). The view's
	 * own scene supplies only the ui scale and the render-target key; no
	 * edit-world state is drawn.
	 */
	renderRunWorld(world: World, time: Time): void {
		const renderer = this.renderer;
		if (renderer.width <= 0 || renderer.height <= 0) {
			return;
		}
		renderer.frame((scope) => {
			renderWorld(scope, {
				world,
				camera: pickActiveCamera2D(world.ecs),
				time,
				input: this.input,
				assetManager: this.services.assetManager,
				uiScale: this.scene.config.uiScale ?? 1,
				presentation: {
					scene: this.scene,
					targetKey: this.scene,
				},
			});
		});
	}

	dispose(): void {
		this.input.dispose();
		this.detach();
		this.renderer.dispose();
		disposePickIndex(this.scene.world.ecs);
		this.weatherPreview.dispose();
		for (const detach of this.detachAudio) {
			detach();
		}
		this.audioBus.dispose();
	}
}
