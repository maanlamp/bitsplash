import { Game, type FrameInfo } from "../game";
import { migrateRenderLayers } from "../render/migrate-render-layers";
import type { GlobalServices } from "../services";
import { migrateSky } from "../sky/migrate-sky";
import {
	deserializeWorld,
	type UnknownComponentPolicy,
} from "../serialization/deserialize";
import {
	Scene,
	type SceneFactory,
	type SceneFile,
	toSceneConfig,
} from "./scene";

export type SceneSummary = Readonly<{
	id: string;
	name: string;
	kind: string;
}>;

/**
 * A freshly built scene paired with the migrated {@link SceneFile} it was
 * deserialized from. The file — the raw registered file passed through the pure
 * migration pipeline — is the canonical baseline for a `SceneDocument`.
 */
export type CreatedScene = Readonly<{
	scene: Scene;
	file: SceneFile;
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

/**
 * The pure migration pipeline: engine migrations (render layers, then
 * `config.clearColor` → a sky entity) followed by the scene's own
 * authored-data migration (e.g. legacy tiles → tile layer). The output is the
 * canonical input for both deserialize and the document baseline; no live world
 * is involved.
 */
const migrateSceneFile = (
	scene: Scene,
	file: SceneFile,
	id: string,
): SceneFile =>
	scene.migrateFile(
		migrateSky(migrateRenderLayers(file, id), id),
		id,
	);

const registeredFile = (id: string): SceneFile => {
	const file = files.get(id);
	if (!file) {
		throw new Error(`Unknown scene id: ${id}`);
	}
	return file;
};

const buildScene = (
	raw: SceneFile,
	id: string,
	services: GlobalServices,
): Scene => {
	const factory = factories.get(raw.kind);
	if (!factory) {
		throw new Error(`Unknown scene kind: ${raw.kind}`);
	}
	return factory({
		config: toSceneConfig(raw.config),
		name: raw.name ?? id,
		services,
	});
};

export const createScene = (
	id: string,
	services: GlobalServices,
	onUnknown: UnknownComponentPolicy = "skip",
): CreatedScene => {
	const raw = registeredFile(id);
	const scene = buildScene(raw, id, services);
	const file = migrateSceneFile(scene, raw, id);
	deserializeWorld(
		scene.world,
		file.entities,
		`scene "${file.name ?? id}"`,
		onUnknown,
	);
	return { scene, file };
};

/**
 * Recompute the migrated {@link SceneFile} for an already-built scene, deriving
 * it from the registered raw file. Lets the editor obtain a document baseline
 * for a scene it did not build via {@link createScene} (e.g. the preloaded
 * start scene the game shell constructed).
 */
export const migratedSceneFile = (
	scene: Scene,
	id: string,
): SceneFile => migrateSceneFile(scene, registeredFile(id), id);

export const createGame = (
	startScene: string,
	onFrame?: (info: FrameInfo) => void,
): Game => {
	const game = new Game({ onFrame });
	game.setScene(createScene(startScene, game.services).scene);
	return game;
};
