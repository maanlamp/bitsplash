import type { Time } from "../engine/clock";
import type { Milliseconds } from "../engine/duration";
import type { EntityId } from "../engine/ecs";
import { pickActiveCamera2D } from "../engine/camera/camera-2d-render";
import type { ActionProvider } from "../engine/input/bindings/action-provider";
import type { DeviceSnapshot } from "../engine/input/device-snapshot";
import { Input } from "../engine/input/input";
import type { SettingsStore } from "../engine/input/settings-store";
import type {
	AuthoredScene,
	GameModule,
	GameUi,
} from "../engine/runtime/game-module";
import type { Runtime } from "../engine/runtime/runtime";
import type { GlobalServices } from "../engine/services";
import type { World } from "../engine/world";
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
	/** Notified when mode/pause change so the playback bar can re-render. */
	onChange: () => void;
}>;

/**
 * Drives the editor's run mode on a real {@link Runtime} (plan D5–D8).
 *
 * A run boots a fresh `World` + `Runtime` via the injected game module (same-world
 * reuse is a hard crash by design), seeded with `newGame` in the focused scene.
 * The run follows `goToScene` transitions, binding the active scene's document as
 * the command-router target so edits route to the run world. On stop the run
 * world is disposed and the edit worlds of run-visited scenes are rebuilt in
 * place from their documents.
 */
export class RunHost {
	private readonly runtime: Runtime;
	private readonly gameUi: GameUi;
	private readonly muted = new Input(document.createElement("div"));
	private readonly visited = new Set<SceneDocument>();

	private mode: RunInputMode = "game";
	private pausedValue = false;
	private lastTime: Time | null = null;
	private activeSceneId: string;
	private activeDoc: SceneDocument | null = null;
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
		this.mountUi();
		this.runtime.newGame(deps.startSceneId);
		this.syncActiveScene();
	}

	get inputMode(): RunInputMode {
		return this.mode;
	}

	get paused(): boolean {
		return this.pausedValue;
	}

	get activeScene(): string {
		return this.activeSceneId;
	}

	/** Physics step time of the run world, for the viewport's perf monitor. */
	get physicsTime(): number {
		return this.runtime.world.physicsTime;
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
		return this.activeDoc?.isRuntimeEntity(id) ?? false;
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

	setPaused(paused: boolean): void {
		this.pausedValue = paused;
		this.deps.onChange();
	}

	togglePause(): void {
		this.setPaused(!this.pausedValue);
	}

	/** Single-step: one fixed update of the run world with muted input. */
	step(): void {
		if (!this.pausedValue || this.lastTime === null) {
			return;
		}
		this.runtime.world.requestSingleStep();
		this.stepWorld(FIXED_DT_MS, this.lastTime, this.muted);
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
		const real = this.view.input;
		const gameInput = this.mode === "game" ? real : this.muted;
		if (!this.pausedValue) {
			this.stepWorld(dt, time, gameInput);
			this.followTransition();
		}
	}

	/** Clear per-frame UI and world events once every view has rendered. */
	endFrame(): void {
		this.gameUi.ui.clearEvents();
		this.runtime.world.events.clear();
	}

	stop(): void {
		if (this.stopped) {
			return;
		}
		this.stopped = true;
		this.unmountUi();
		for (const doc of this.visited) {
			doc.unbindRun();
			doc.rebuildLive();
		}
		this.runtime.dispose();
		this.muted.dispose();
	}

	private stepWorld(
		dt: Milliseconds,
		time: Time,
		input: DeviceSnapshot,
	): void {
		const world = this.runtime.world;
		const actions = this.deps.actions;
		const camera = pickActiveCamera2D(world.ecs);
		const base = {
			dt,
			time,
			ecs: world.ecs,
			world,
			assetManager: this.deps.services.assetManager,
			audio: this.deps.services.audio,
			events: world.events,
			camera,
		};
		const uiScale = this.runtime.config?.uiScale ?? 1;
		this.gameUi.ui.step(input, uiScale, dt / 1000, (masked) => {
			actions.step(masked, dt);
			world.ecs.update({ ...base, input: masked, actions });
			world.ecs.flushDestroyed();
		});
		this.gameUi.ui.layout(
			uiScale,
			this.view.renderer.width,
			this.view.renderer.height,
			camera ?? undefined,
		);
	}

	private followTransition(): void {
		if (this.runtime.activeScene !== this.activeSceneId) {
			this.syncActiveScene();
		}
	}

	/**
	 * Rebind the command router to whichever scene the runtime is now in: unbind
	 * the previous active document and bind the new one (lazily created if the
	 * scene was entered mid-run with no open document).
	 */
	private syncActiveScene(): void {
		const id = this.runtime.activeScene;
		if (id === null) {
			return;
		}
		this.activeSceneId = id;
		this.activeDoc?.unbindRun();
		const doc = this.deps.ensureDocument(id);
		doc.bindRun({
			world: this.runtime.world,
			config: this.runtime.config ?? doc.config,
		});
		this.activeDoc = doc;
		this.visited.add(doc);
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
