import type { SceneFile } from "../scene/scene";
import type { SerializedEntity } from "../serialization/registry";
import { encodeComponents } from "../serialization/serialize";
import {
	DEFAULT_RENDER_LAYERS,
	renderLayerDef,
} from "./render-layers";
import { RenderLayersComponent } from "./render-layers-component";

/**
 * Pure `SceneFile → SceneFile` migration that guarantees a scene declares its
 * render layers. When no entity carries a `RenderLayers` component, a new
 * entity holding {@link DEFAULT_RENDER_LAYERS} is appended, with an id derived
 * deterministically from the scene id (`${sceneId}:render-layers`) so repeated
 * opens produce byte-identical baselines. Idempotent: a file that already has
 * a `RenderLayers` entity is returned unchanged.
 *
 * @example
 * const migrated = migrateRenderLayers(file, "demo");
 */
export const migrateRenderLayers = (
	file: SceneFile,
	sceneId: string,
): SceneFile => {
	if (
		file.entities.some(
			(entity) => "RenderLayers" in entity.components,
		)
	) {
		return file;
	}
	const component = new RenderLayersComponent();
	component.layers = DEFAULT_RENDER_LAYERS.map((id) =>
		renderLayerDef(id),
	);
	const entity: SerializedEntity = {
		id: `${sceneId}:render-layers`,
		components: encodeComponents([component]),
	};
	return { ...file, entities: [...file.entities, entity] };
};
