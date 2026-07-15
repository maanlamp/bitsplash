import type {
	Scene,
	SceneConfig,
	SceneFile,
} from "../engine/scene/scene";
import type { SerializedWorld } from "../engine/serialization/registry";

/**
 * Build a {@link SceneFile} from a scene's identity, a config, and a set of
 * already serialized entities. The single place the on-disk file shape
 * (version, kind, config projection) is assembled, shared by
 * {@link exportSceneJson} and the document baseline.
 *
 * @param config the config to project onto the file. Defaults to the scene's
 *   live config; the document's save passes the config it replayed from its
 *   baseline instead, so no live scene state reaches the written bytes.
 */
export const sceneFileFrom = (
	scene: Scene,
	entities: SerializedWorld,
	config: SceneConfig = scene.config,
): SceneFile => ({
	version: 1,
	kind: scene.kind,
	name: scene.name,
	config: {
		gravity: {
			x: config.gravity.x,
			y: config.gravity.y,
		},
		uiScale: config.uiScale,
		clearColor: config.clearColor.css,
	},
	entities,
});

export const exportSceneJson = (
	scene: Scene,
	entities: SerializedWorld,
	config?: SceneConfig,
): string =>
	JSON.stringify(sceneFileFrom(scene, entities, config), null, "\t");
