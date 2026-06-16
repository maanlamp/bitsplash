import { Settings } from "planck";
import { Game, type FrameInfo } from "../game";
import { TILE_SIZE } from "../tile";
import type { SceneDefinition } from "./scene";

const definitions = new Map<string, SceneDefinition>();

export const registerScene = (definition: SceneDefinition): void => {
	definitions.set(definition.kind, definition);
};

export const sceneKinds = (): ReadonlyArray<string> => [
	...definitions.keys(),
];

export const createGame = (
	kind: string,
	onFrame?: (info: FrameInfo) => void,
): Game => {
	const definition = definitions.get(kind);
	if (!definition) {
		throw new Error(`Unknown scene kind: ${kind}`);
	}
	Settings.lengthUnitsPerMeter = TILE_SIZE;
	const game = new Game({
		gravity: definition.gravity,
		uiScale: definition.uiScale,
		onFrame,
	});
	game.buildScene(definition.build);
	return game;
};
