import type { EntityId, ReadonlyECS } from "../engine/ecs";
import { TileLayerComponent } from "../engine/tilemap/tile-layer-component";
import type { EditorState } from "./editor-state";

export const activeTileLayer = (
	ecs: ReadonlyECS,
	editor: EditorState,
): readonly [EntityId, TileLayerComponent] | null => {
	const layers = ecs.query(TileLayerComponent);
	const active = layers.find(([id]) => id === editor.activeLayer);
	return active ?? layers[0] ?? null;
};
