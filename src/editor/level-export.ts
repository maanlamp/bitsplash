import type { Scene, SceneFile } from "../engine/scene/scene";
import type { SerializedWorld } from "../engine/serialization/registry";

export const exportSceneJson = (
	scene: Scene,
	entities: SerializedWorld,
): string => {
	const file: SceneFile = {
		version: 1,
		kind: scene.kind,
		name: scene.name,
		config: scene.config,
		entities,
	};
	return JSON.stringify(file, null, "\t");
};
