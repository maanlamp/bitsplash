import type { SettingsStore } from "../../engine/input/settings-store";
import type {
	AuthoredScene,
	CreateRuntimeOptions,
	GameModule,
	GameUi,
} from "../../engine/runtime/game-module";
import { Runtime } from "../../engine/runtime/runtime";
import {
	type SceneConfig,
	toSceneConfig,
} from "../../engine/scene/scene";
import type { GlobalServices } from "../../engine/services";
import { World } from "../../engine/world";
import { collisionMatrix } from "../collision";
import {
	editorEdit,
	editorRun,
	game as gameComposition,
} from "../compositions";
import { sceneFiles } from "../registrations";
import { newGameSeed } from "../runtime/new-game-seed";
import { toSceneDefinition } from "../runtime/scene-runtime";
import { createEditorHud } from "../ui/editor-hud";

export const INITIAL_SCENE = "demo";

export const resolveScene = (id: string): AuthoredScene => {
	const file = sceneFiles.get(id);
	if (!file) {
		throw new Error(`Unknown scene id: ${id}`);
	}
	return {
		config: toSceneConfig(file.config),
		entities: file.entities,
		bounds: null,
	};
};

const registerSystems = (
	world: World,
	config: SceneConfig,
	settings: SettingsStore,
): void => {
	const { update, render } = gameComposition({
		settings,
		gravityY: config.gravity.y,
	});
	for (const system of update) {
		world.ecs.addUpdateSystem(system);
	}
	for (const system of render) {
		world.ecs.addRenderSystem(system);
	}
};

const buildRuntime = (
	settings: SettingsStore,
	resolve: (id: string) => AuthoredScene,
): Runtime => {
	const config = resolve(INITIAL_SCENE).config;
	const world = new World(config.gravity, collisionMatrix);
	registerSystems(world, config, settings);
	return new Runtime({
		world,
		seed: newGameSeed,
		resolveScene: (id) => toSceneDefinition(resolve(id)),
	});
};

/** Build the menu/restore-target runtime for the bundled game (not seeded). */
export const createFreshRuntime = (
	settings: SettingsStore,
): Runtime => buildRuntime(settings, resolveScene);

/** Build a runtime and start a new game in {@link INITIAL_SCENE}. */
export const startNewRuntime = (settings: SettingsStore): Runtime => {
	const runtime = buildRuntime(settings, resolveScene);
	runtime.newGame(INITIAL_SCENE);
	return runtime;
};

/**
 * Construct the concrete {@link GameModule} the editor consumes through the
 * engine seam. `main.tsx` calls this and injects the result into the editor
 * `App`; the editor never imports this module directly.
 */
export const createPlatformerGameModule = (): GameModule => ({
	initialScene: INITIAL_SCENE,
	resolveScene,
	compositions: {
		game: gameComposition,
		editorRun,
		editorEdit,
	},
	createRuntime: (options: CreateRuntimeOptions): Runtime =>
		buildRuntime(
			options.settings,
			options.resolveScene ?? resolveScene,
		),
	createGameUi: (services: GlobalServices): GameUi =>
		createEditorHud(services),
});
