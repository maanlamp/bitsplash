import type { SceneFile } from "../../engine/scene/scene";
import type { SerializedEntity } from "../../engine/serialization/registry";
import { encodeComponents } from "../../engine/serialization/serialize";
import { TileLayerComponent } from "../../engine/tilemap/tile-layer-component";

/**
 * Pure `SceneFile → SceneFile` migration upgrading a legacy scene's flat
 * `tiles` array into a `TileLayer` entity. When the file has tiles but no tile
 * layer, a `"terrain"` layer carrying those cells and the given tileset is
 * appended to `entities`, with an id derived deterministically from the scene
 * id (`${sceneId}:tile-layer`) so repeated opens produce identical baselines.
 * Idempotent: a file that already declares a `TileLayer`, or has no tiles, is
 * returned unchanged.
 *
 * @example
 * const migrated = migrateLegacyTiles(file, "demo", tilesetUrl);
 */
export const migrateLegacyTiles = (
	file: SceneFile,
	sceneId: string,
	tilesetPath: string,
): SceneFile => {
	if (!file.tiles?.length) {
		return file;
	}
	if (
		file.entities.some((entity) => "TileLayer" in entity.components)
	) {
		return file;
	}
	const layer = new TileLayerComponent();
	layer.name = "terrain";
	layer.tilesetRef.set(tilesetPath);
	layer.cells = file.tiles;
	const entity: SerializedEntity = {
		id: `${sceneId}:tile-layer`,
		components: encodeComponents([layer]),
	};
	return { ...file, entities: [...file.entities, entity] };
};
