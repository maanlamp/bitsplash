import type { Bounds } from "../camera/camera-2d";
import type { SettingsStore } from "../input/settings-store";
import type { SceneConfig } from "../scene/scene";
import type { GlobalServices } from "../services";
import type { SerializedWorld } from "../serialization/registry";
import type { RenderSystem, UpdateSystem } from "../system";
import type { UiRuntime } from "../ui/ui-runtime";
import type { Runtime } from "./runtime";

/**
 * A scene resolved to the data a {@link Runtime} needs to build and enter it:
 * its config plus the authored entity payload. This is the engine-side seam
 * type the editor depends on so it never imports the game's scene resolution
 * directly.
 */
export type AuthoredScene = Readonly<{
	config: SceneConfig;
	entities: SerializedWorld;
	bounds?: Bounds | null;
}>;

/**
 * Inputs a {@link Composition} needs to build its systems. Every composition
 * receives the same shape and reads only the fields it needs (the game and
 * edit-world compositions ignore `hud`; the edit-world composition ignores
 * `settings`).
 */
export type CompositionContext = Readonly<{
	/** Settings store, threaded so aim (and any future settings-driven system) reads live values. */
	settings: SettingsStore;
	/** Magnitude of downward gravity, used to seed nav-graph jump arcs. */
	gravityY: number;
	/** HUD systems to fold into a run composition, if the host runs UI. */
	hud?: GameUi;
}>;

/** The update and render systems a composition contributes to a world. */
export type CompositionSystems = Readonly<{
	update: ReadonlyArray<UpdateSystem>;
	render: ReadonlyArray<RenderSystem>;
}>;

/**
 * A named ECS system composition. Given a {@link CompositionContext} it
 * produces the systems for one play mode; the caller decides whether to add
 * them to a world immediately (bundled game) or hold them for staged
 * simulation (editor run mode).
 */
export type Composition = (
	ctx: CompositionContext,
) => CompositionSystems;

/** The game's UI runtime plus the systems that drive and render it. */
export type GameUi = Readonly<{
	ui: UiRuntime;
	update: ReadonlyArray<UpdateSystem>;
	render: ReadonlyArray<RenderSystem>;
}>;

/** Options for {@link GameModule.createRuntime}. */
export type CreateRuntimeOptions = Readonly<{
	/** Settings store threaded into the game composition (e.g. aim settings). */
	settings: SettingsStore;
	/**
	 * Override scene resolution for this runtime. Lets a host (e.g. the editor
	 * run host in a later step) feed dirty in-memory documents to a run instead
	 * of the committed scene files.
	 */
	resolveScene?: (id: string) => AuthoredScene;
}>;

/**
 * The single engine-typed seam through which the editor consumes the game.
 *
 * `main.tsx` (a composition entrypoint that may import game code) constructs
 * the concrete object and injects it into the editor `App`; the editor and the
 * rest of `src/editor/**` reference only this interface, so no editor module
 * imports game code.
 */
export type GameModule = Readonly<{
	/** Id of the scene a new game starts in. */
	initialScene: string;
	/** Resolve a scene id to its authored payload. */
	resolveScene: (id: string) => AuthoredScene;
	/** The three named play-mode compositions. */
	compositions: Readonly<{
		/** The full flat gameplay + render list for the bundled game. */
		game: Composition;
		/** The gameplay composition, stepped by the editor's run host. */
		editorRun: Composition;
		/** Render + live edit-world maintenance only; no gameplay, no physics. */
		editorEdit: Composition;
	}>;
	/**
	 * Build a fresh {@link Runtime} (world + game composition), not yet seeded.
	 * Call `newGame`/`restore` on the result to start playing.
	 */
	createRuntime: (options: CreateRuntimeOptions) => Runtime;
	/** Mount the game's UI and return the runtime + systems that drive it. */
	createGameUi: (services: GlobalServices) => GameUi;
}>;
