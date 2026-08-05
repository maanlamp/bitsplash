import type { Time } from "../engine/clock";
import type { Milliseconds } from "../engine/duration";
import type { EntityId } from "../engine/ecs";
import type { ActionProvider } from "../engine/input/bindings/action-provider";
import type { DeviceSnapshot } from "../engine/input/device-snapshot";
import { Input } from "../engine/input/input";
import type { SettingsStore } from "../engine/input/settings-store";
import type {
	AuthoredScene,
	GameModule,
	GameUi,
} from "../engine/runtime/game-module";
import { Host } from "../engine/runtime/host";
import type { Runtime } from "../engine/runtime/runtime";
import { Scene, SceneConfig } from "../engine/scene/scene";
import type { GlobalServices } from "../engine/services";
import type { World } from "../engine/world";
import { RunDocumentPlugin } from "./run-document-plugin";
import type { SceneDocument } from "./scene-document";
import type { SceneView } from "./scene-view";

export type RunInputMode = "game" | "editor";

const FIXED_DT_MS = (1000 / 60) as Milliseconds;

/**
 * Collaborators the {@link RunHost} needs from the editor `App`, kept as plain
 * callbacks so the host depends on no React state directly.
 */
export type RunHostDeps = Readonly<{
	gameModule: GameModule;
	services: GlobalServices;
	settings: SettingsStore;
	/** Action provider stepped into the run world's gameplay each frame. */
	actions: ActionProvider;
	/**
	 * The full game HUD, created once and reused across runs (a fresh
	 * {@link GameUi} per run would leak a React root). Its systems are added to
	 * each run world and removed on stop.
	 */
	gameUi: GameUi;
	/** The scene id the run starts in (the focused view's scene). */
	startSceneId: string;
	/**
	 * The already-open document authoring a scene id, if one exists — its current
	 * projection feeds the run so dirty edits play (plan D5). `null` when no
	 * document is open for the scene (the registry copy is used instead).
	 */
	openDocument: (sceneId: string) => SceneDocument | null;
	/**
	 * The document authoring a scene id, created lazily if absent (a scene
	 * entered mid-run with no open document gets one — file → migrations →
	 * baseline + empty journal). Commands route to the active scene's document.
	 */
	ensureDocument: (sceneId: string) => SceneDocument;
	/** Notified with the active scene id after each `goToScene` transition. */
	onActiveSceneChange: (sceneId: string) => void;
	/** Notified when mode/freeze change so the playback bar can re-render. */
	onChange: () => void;
}>;

/**
 * Drives the editor's run mode on a real {@link Runtime} (plan D5–D8).
 *
 * A run boots a fresh `World` + `Runtime` via the injected game module (same-world
 * reuse is a hard crash by design), seeded with `newGame` in the focused scene.
 * The frame itself belongs to the engine's {@link Host}; this class supplies the
 * seams that make it a *run inside the editor* — a {@link Scene} projected over
 * the runtime's live world, an input source that switches between real and muted
 * as edit-while-running toggles, and a {@link RunDocumentPlugin} that rebinds the
 * command router as the run moves between scenes. On stop the run world is
 * disposed and the edit worlds of run-visited scenes are rebuilt in place.
 */
export class RunHost {
	private readonly runtime: Runtime;
	private readonly gameUi: GameUi;
	private readonly muted = new Input(document.createElement("div"));
	private readonly documents: RunDocumentPlugin;
	private readonly host: Host;

	private mode: RunInputMode = "game";
	private lastTime: Time | null = null;
	private activeSceneId: string;
	private projected: Scene;
	private projectedConfig: SceneConfig | null = null;
	private projectedWorld: World | null = null;
	private stepMuted = false;
	private stopped = false;

	constructor(
		readonly view: SceneView,
		private readonly deps: RunHostDeps,
	) {
		this.activeSceneId = deps.startSceneId;
		this.gameUi = deps.gameUi;
		this.runtime = deps.gameModule.createRuntime({
			settings: deps.settings,
			resolveScene: (id) => this.resolveScene(id),
		});
		this.runtime.world.attachAudio(
			deps.services.audio,
			view.worldBus,
		);
		this.documents = new RunDocumentPlugin({
			ensureDocument: deps.ensureDocument,
			world: () => this.runtime.world,
			config: () => this.runtime.config ?? null,
		});
		this.projected = this.project();
		this.host = new Host({
			sceneSource: { current: () => this.projected },
			inputSource: { sample: () => this.device() },
			ui: {
				runtime: () => this.gameUi.ui,
				width: () => this.view.renderer.width,
				height: () => this.view.renderer.height,
			},
			// The editor advances its own per-window clock for every view it
			// hosts, so it never calls `Host.advance`; this is the clock the
			// engine's own consumers would use.
			clock: deps.services.clock,
			services: deps.services,
			plugins: [this.documents],
			// The profiler panel is a permanent editor affordance, so a run always
			// carries per-system timing regardless of the build it runs in.
			profiling: true,
		});
		this.mountUi();
		this.runtime.newGame(deps.startSceneId);
		this.syncActiveScene();
	}

	get inputMode(): RunInputMode {
		return this.mode;
	}

	/**
	 * Whether the run is held in the editor's debugger: no ticker advances at all
	 * until unfrozen or single-stepped. Distinct from the player's gameplay pause,
	 * which the run world's own UI owns.
	 */
	get frozen(): boolean {
		return this.host.frozen;
	}

	get activeScene(): string {
		return this.activeSceneId;
	}

	/**
	 * The live run world. Every view bound to the {@link activeScene} renders it
	 * (plan D13: Y-bound views project the run world); the frame loop reads this
	 * to drive their {@link SceneView.renderRunWorld}.
	 */
	get world(): World {
		return this.runtime.world;
	}

	/** Whether `id` is a runtime-spawned entity in the active scene's document. */
	isRuntimeEntity(id: EntityId): boolean {
		return this.documents.isRuntimeEntity(id);
	}

	setMode(mode: RunInputMode): void {
		if (this.mode === mode) {
			return;
		}
		this.mode = mode;
		this.deps.onChange();
	}

	toggleMode(): void {
		this.setMode(this.mode === "game" ? "editor" : "game");
	}

	freeze(frozen: boolean): void {
		this.host.freeze(frozen);
		this.deps.onChange();
	}

	toggleFreeze(): void {
		this.freeze(!this.host.frozen);
	}

	/** Single-step: one fixed update of the run world with muted input. */
	step(): void {
		if (!this.host.frozen || this.lastTime === null) {
			return;
		}
		this.view.rollInput();
		this.muted.update();
		this.stepMuted = true;
		try {
			this.host.stepOnce(FIXED_DT_MS, this.lastTime);
		} finally {
			this.stepMuted = false;
		}
		this.followTransition();
		this.deps.onChange();
	}

	/**
	 * Advance the run world one frame (the run world's owner steps it once per
	 * frame, plan D13). Rendering is the frame loop's job: every view bound to
	 * {@link activeScene} draws {@link world} via {@link SceneView.renderRunWorld}.
	 * Call {@link endFrame} after all views have rendered.
	 */
	frame(dt: Milliseconds, time: Time): void {
		this.lastTime = time;
		this.view.rollInput();
		this.muted.update();
		this.host.step(dt, time);
		if (!this.host.frozen) {
			this.followTransition();
		}
	}

	/** Clear per-frame UI and world events once every view has rendered. */
	endFrame(): void {
		this.host.endFrame();
	}

	stop(): void {
		if (this.stopped) {
			return;
		}
		this.stopped = true;
		this.unmountUi();
		this.host.stop();
		this.runtime.dispose();
		this.muted.dispose();
	}

	/**
	 * This frame's input: the view's real device, or the muted one while editor
	 * input owns the view and during a single step. The host resets action edges
	 * whenever this returns a different device, so toggling edit-while-running
	 * mid-hold cannot leave a pressed edge latched.
	 */
	private device(): DeviceSnapshot {
		return this.stepMuted || this.mode === "editor"
			? this.muted
			: this.view.input;
	}

	/**
	 * The runtime's live world seen as a {@link Scene} — what the host steps.
	 * Rebuilt only when the runtime's scene, world or config actually changes, so
	 * the host observes one stable scene per transition rather than one per frame.
	 */
	private project(): Scene {
		this.projectedWorld = this.runtime.world;
		this.projectedConfig = this.runtime.config ?? null;
		return new Scene({
			kind: "game",
			name: this.activeSceneId,
			config: this.projectedConfig ?? new SceneConfig(),
			world: this.projectedWorld,
			actions: this.deps.actions,
		});
	}

	private followTransition(): void {
		if (
			this.runtime.activeScene !== this.activeSceneId ||
			this.runtime.world !== this.projectedWorld ||
			(this.runtime.config ?? null) !== this.projectedConfig
		) {
			this.syncActiveScene();
		}
	}

	/**
	 * Re-project whichever scene the runtime is now in and rebind the command
	 * router to it. Called the moment a transition is observed rather than left to
	 * the host's `onSceneChanged`, so routing never lags a frame behind the world
	 * it targets; the plugin's own hook is idempotent and sees a no-op.
	 */
	private syncActiveScene(): void {
		const id = this.runtime.activeScene;
		if (id === null) {
			return;
		}
		this.activeSceneId = id;
		this.projected = this.project();
		this.documents.enterScene(id);
		this.deps.onActiveSceneChange(id);
	}

	private resolveScene(id: string): AuthoredScene {
		return (
			this.deps.openDocument(id)?.toAuthoredScene() ??
			this.deps.gameModule.resolveScene(id)
		);
	}

	private mountUi(): void {
		const world = this.runtime.world;
		for (const system of this.gameUi.update) {
			world.ecs.addUpdateSystem(system);
		}
		for (const system of this.gameUi.render) {
			world.ecs.addRenderSystem(system);
		}
	}

	private unmountUi(): void {
		const world = this.runtime.world;
		for (const system of this.gameUi.update) {
			world.ecs.removeUpdateSystem(system);
		}
		for (const system of this.gameUi.render) {
			world.ecs.removeRenderSystem(system);
		}
	}
}
