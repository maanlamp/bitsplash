import type { EntityId, ReadonlyECS } from "../ecs";
import type { GridBounds } from "./grid";
import { TileLayerComponent } from "./tile-layer-component";

export const tileLayers = (
	ecs: ReadonlyECS,
): ReadonlyArray<readonly [EntityId, TileLayerComponent]> =>
	ecs.query(TileLayerComponent);

export const solidTileLayers = (
	ecs: ReadonlyECS,
): ReadonlyArray<readonly [EntityId, TileLayerComponent]> =>
	tileLayers(ecs).filter(([, layer]) => layer.collision === "solid");

export const isSolidCell = (
	ecs: ReadonlyECS,
	gx: number,
	gy: number,
): boolean =>
	solidTileLayers(ecs).some(([, layer]) =>
		layer.grid.hasTile(gx, gy),
	);

export const mergedSolidCells = (ecs: ReadonlyECS): Set<string> => {
	const cells = new Set<string>();
	for (const [, layer] of solidTileLayers(ecs)) {
		for (const [gx, gy] of layer.grid.occupiedCells()) {
			cells.add(`${gx},${gy}`);
		}
	}
	return cells;
};

const mergeBounds = (
	layers: ReadonlyArray<readonly [EntityId, TileLayerComponent]>,
): GridBounds | null => {
	let merged: GridBounds | null = null;
	for (const [, layer] of layers) {
		const bounds = layer.grid.bounds();
		if (!bounds) {
			continue;
		}
		merged = merged
			? {
					minX: Math.min(merged.minX, bounds.minX),
					minY: Math.min(merged.minY, bounds.minY),
					maxX: Math.max(merged.maxX, bounds.maxX),
					maxY: Math.max(merged.maxY, bounds.maxY),
				}
			: bounds;
	}
	return merged;
};

export const solidBounds = (ecs: ReadonlyECS): GridBounds | null =>
	mergeBounds(solidTileLayers(ecs));

export const tileBounds = (ecs: ReadonlyECS): GridBounds | null =>
	mergeBounds(tileLayers(ecs));
