import type { ECS, EntityId } from "../engine/ecs";
import { resolveRenderLayer } from "../engine/render/render-layers";
import { RenderLayersComponent } from "../engine/render/render-layers-component";
import {
	type TileCollisionMode,
	TileLayerComponent,
} from "../engine/tilemap/tile-layer-component";
import { createEntity, entityFieldBinding } from "./commands";
import type { JournalEntry } from "./journal-entry";
import type { SceneDocument } from "./scene-document";

const TILE_LAYER = "TileLayer";

export const ENTITIES_ROW = " entities";

const ORDER_STEP = 10;

const registryIndex = (ecs: ECS, id: string): number => {
	const layers =
		ecs.queryFirst(RenderLayersComponent)?.[1].layers ?? [];
	const index = layers.findIndex((def) => def.id === id);
	return index < 0 ? layers.length : index;
};

export const layerRowIds = (ecs: ECS): string[] => {
	const entries = [...ecs.query(TileLayerComponent)];
	entries.sort((a, b) => {
		const diff =
			resolveRenderLayer(ecs, b[1].renderLayer, b[1].order) -
			resolveRenderLayer(ecs, a[1].renderLayer, a[1].order);
		return diff !== 0 ? diff : a[0].localeCompare(b[0]);
	});
	const entitiesIndex = registryIndex(ecs, "entities");
	const above = entries.filter(
		([, layer]) =>
			registryIndex(ecs, layer.renderLayer) > entitiesIndex,
	);
	const below = entries.filter(
		([, layer]) =>
			registryIndex(ecs, layer.renderLayer) <= entitiesIndex,
	);
	return [
		...above.map(([id]) => id),
		ENTITIES_ROW,
		...below.map(([id]) => id),
	];
};

export const applyRowOrder = (
	ecs: ECS,
	ids: ReadonlyArray<string>,
): void => {
	const marker = ids.indexOf(ENTITIES_ROW);
	if (marker < 0) {
		return;
	}
	ids.forEach((id, index) => {
		if (id === ENTITIES_ROW) {
			return;
		}
		const layer = ecs.getComponent(
			id as EntityId,
			TileLayerComponent,
		);
		if (!layer) {
			return;
		}
		if (index < marker) {
			layer.renderLayer = "terrain";
			layer.order = (marker - 1 - index) * ORDER_STEP;
		} else {
			layer.renderLayer = "background";
			layer.order = (ids.length - 1 - index) * ORDER_STEP;
		}
	});
};

type LayerPlacement = Readonly<{
	renderLayer: string;
	order: number;
}>;

const placements = (
	ecs: ECS,
	ids: ReadonlyArray<string>,
): Map<EntityId, LayerPlacement> => {
	const map = new Map<EntityId, LayerPlacement>();
	for (const id of ids) {
		if (id === ENTITIES_ROW) {
			continue;
		}
		const layer = ecs.getComponent(
			id as EntityId,
			TileLayerComponent,
		);
		if (layer) {
			map.set(id as EntityId, {
				renderLayer: layer.renderLayer,
				order: layer.order,
			});
		}
	}
	return map;
};

/**
 * Reorder tile layers by re-applying their render layer + order to match the
 * dragged row order. Journaled as one composite of field edits so the whole
 * reorder is a single undo step.
 */
export const commitRowOrder = (
	document: SceneDocument,
	before: ReadonlyArray<string>,
	after: ReadonlyArray<string>,
): void => {
	if (before.join("|") === after.join("|")) {
		return;
	}
	const ecs = document.projection as ECS;
	const beforePlacement = placements(ecs, before);
	applyRowOrder(ecs, after);
	const afterPlacement = placements(ecs, after);
	const entries: JournalEntry[] = [];
	for (const [id, next] of afterPlacement) {
		const prev = beforePlacement.get(id);
		if (!prev) {
			continue;
		}
		if (prev.renderLayer !== next.renderLayer) {
			entries.push({
				kind: "field-set",
				id,
				type: TILE_LAYER,
				path: ["renderLayer"],
				before: prev.renderLayer,
				after: next.renderLayer,
			});
		}
		if (prev.order !== next.order) {
			entries.push({
				kind: "field-set",
				id,
				type: TILE_LAYER,
				path: ["order"],
				before: prev.order,
				after: next.order,
			});
		}
	}
	if (entries.length > 0) {
		document.recordApplied({ kind: "composite", entries });
	}
};

export const addTileLayer = (document: SceneDocument): EntityId => {
	const existing = document.projection.query(TileLayerComponent);
	const layer = new TileLayerComponent();
	layer.name = `Layer ${existing.length + 1}`;
	layer.tilesetRef.set("");
	layer.order =
		existing
			.filter(([, l]) => l.renderLayer === layer.renderLayer)
			.reduce((max, [, l]) => Math.max(max, l.order), -ORDER_STEP) +
		ORDER_STEP;
	return createEntity(document, [layer]);
};

export const renameTileLayer = (
	document: SceneDocument,
	id: EntityId,
	name: string,
): void => {
	entityFieldBinding(document, id, TILE_LAYER).commit(["name"], name);
};

export const setTileLayerTileset = (
	document: SceneDocument,
	id: EntityId,
	tileset: string,
): void => {
	entityFieldBinding(document, id, TILE_LAYER).commit(
		["tilesetRef", "path"],
		tileset,
	);
};

export const setTileLayerCollision = (
	document: SceneDocument,
	id: EntityId,
	collision: TileCollisionMode,
): void => {
	entityFieldBinding(document, id, TILE_LAYER).commit(
		["collision"],
		collision,
	);
};
