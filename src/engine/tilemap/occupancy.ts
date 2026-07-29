import type { EntityId, ReadonlyECS } from "../ecs";
import type { GridBounds } from "./grid";
import { TileLayerComponent } from "./tile-layer-component";

type TileLayers = ReadonlyArray<
	readonly [EntityId, TileLayerComponent]
>;

/**
 * The key a tile cell is stored under in every merged cell set here, so callers
 * testing a coordinate cannot spell the format differently than the sets do.
 *
 * @example
 * mergedRainBlockingCells(ecs).has(tileCellKey(gx, gy));
 */
export const tileCellKey = (gx: number, gy: number): string =>
	`${gx},${gy}`;

/**
 * Identity of a set of layers and the state of their grids, as one string —
 * what a consumer caching derived tile data compares to decide it is stale.
 *
 * Layer ids make adding or removing a layer a change, and `grid.version` makes
 * any paint one. `TileGrid.onChange` fires in a microtask and is therefore
 * useless mid-frame, so this is polled instead.
 *
 * @example
 * const signature = tileLayerSignature(solidTileLayers(ecs));
 * if (signature === this.signature) return;
 */
export const tileLayerSignature = (layers: TileLayers): string =>
	layers
		.map(([id, layer]) => `${id}:${layer.grid.version}`)
		.join("|");

export const tileLayers = (
	ecs: ReadonlyECS,
): ReadonlyArray<readonly [EntityId, TileLayerComponent]> =>
	ecs.query(TileLayerComponent);

export const solidTileLayers = (
	ecs: ReadonlyECS,
): ReadonlyArray<readonly [EntityId, TileLayerComponent]> =>
	tileLayers(ecs).filter(([, layer]) => layer.collision === "solid");

/**
 * The layers that keep rain out: those explicitly marked `"blocks"`, plus the
 * `"auto"` layers whose collision already stops the player.
 *
 * This is the only place the tri-state is resolved against `collision`; every
 * rain consumer goes through it so shelter and the inspector never disagree.
 */
export const rainBlockingLayers = (
	ecs: ReadonlyECS,
): ReadonlyArray<readonly [EntityId, TileLayerComponent]> =>
	tileLayers(ecs).filter(
		([, layer]) =>
			layer.rainBlocking === "blocks" ||
			(layer.rainBlocking === "auto" && layer.collision === "solid"),
	);

export const isSolidCell = (
	ecs: ReadonlyECS,
	gx: number,
	gy: number,
): boolean =>
	solidTileLayers(ecs).some(([, layer]) =>
		layer.grid.hasTile(gx, gy),
	);

const mergeCells = (layers: TileLayers): Set<string> => {
	const cells = new Set<string>();
	for (const [, layer] of layers) {
		for (const [gx, gy] of layer.grid.occupiedCells()) {
			cells.add(tileCellKey(gx, gy));
		}
	}
	return cells;
};

export const mergedSolidCells = (ecs: ReadonlyECS): Set<string> =>
	mergeCells(solidTileLayers(ecs));

/**
 * Every cell that keeps rain out, as `"gx,gy"` keys — the classification of
 * {@link rainBlockingLayers}, not solidity.
 *
 * A precipitation particle tests against this rather than
 * {@link mergedSolidCells} so a tarpaulin marked `"blocks"` stops drops it does
 * not stop the player with, and a grate marked `"passes"` lets them through.
 *
 * @example
 * const blocked = mergedRainBlockingCells(ecs);
 * blocked.has(tileCellKey(gx, gy));
 */
export const mergedRainBlockingCells = (
	ecs: ReadonlyECS,
): Set<string> => mergeCells(rainBlockingLayers(ecs));

const mergeBounds = (layers: TileLayers): GridBounds | null => {
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
