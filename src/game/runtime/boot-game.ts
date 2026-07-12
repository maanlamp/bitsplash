import { Runtime } from "../../engine/runtime/runtime";
import { World } from "../../engine/world";
import { collisionMatrix } from "../collision";
import { newGameSeed } from "./new-game-seed";
import {
	type AuthoredScene,
	toSceneDefinition,
} from "./scene-runtime";

export type BootGameOptions = Readonly<{
	initialScene: string;
	resolveScene: (id: string) => AuthoredScene;
	registerSystems?: (world: World) => void;
}>;

export const bootGame = (options: BootGameOptions): Runtime => {
	const initial = options.resolveScene(options.initialScene);
	const world = new World(initial.config.gravity, collisionMatrix);
	options.registerSystems?.(world);
	const runtime = new Runtime({
		world,
		seed: newGameSeed,
		resolveScene: (id) => toSceneDefinition(options.resolveScene(id)),
	});
	runtime.newGame(options.initialScene);
	return runtime;
};
