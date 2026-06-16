import { Settings } from "planck";
import { Game, type FrameInfo } from "../game";
import type { GlobalServices } from "../services";
import { deserializeWorld } from "../serialization/deserialize";
import type { SerializedWorld } from "../serialization/registry";
import { TILE_SIZE } from "../tile";
import { Scene, type SceneFactory, type SceneFile } from "./scene";

export type SceneSummary = Readonly<{
	id: string;
	name: string;
	kind: string;
}>;

const factories = new Map<string, SceneFactory>();
const files = new Map<string, SceneFile>();

export const registerScene = (
	kind: string,
	factory: SceneFactory,
): void => {
	factories.set(kind, factory);
};

export const registerSceneFile = (
	id: string,
	file: SceneFile,
): void => {
	files.set(id, file);
};

export const sceneSummaries = (): ReadonlyArray<SceneSummary> =>
	[...files.entries()].map(([id, file]) => ({
		id,
		name: file.name ?? id,
		kind: file.kind,
	}));

export const createScene = (
	id: string,
	services: GlobalServices,
): Scene => {
	const file = files.get(id);
	if (!file) {
		throw new Error(`Unknown scene id: ${id}`);
	}
	const factory = factories.get(file.kind);
	if (!factory) {
		throw new Error(`Unknown scene kind: ${file.kind}`);
	}
	const scene = factory({
		config: file.config,
		name: file.name ?? id,
		services,
	});
	if (scene.tileGrid) {
		for (const rect of file.tiles) {
			for (let gy = rect.y; gy < rect.y + rect.h; gy++) {
				for (let gx = rect.x; gx < rect.x + rect.w; gx++) {
					scene.tileGrid.setTile(gx, gy);
				}
			}
		}
	}
	deserializeWorld(scene.world, file.entities as SerializedWorld);
	return scene;
};

export const createGame = (
	startScene: string,
	onFrame?: (info: FrameInfo) => void,
): Game => {
	Settings.lengthUnitsPerMeter = TILE_SIZE;
	const game = new Game({ onFrame });
	game.sceneManager.setBase(createScene(startScene, game.services));
	return game;
};
