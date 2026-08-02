import type { EntityId, ReadonlyECS } from "../ecs";
import type { GridBounds } from "./grid";
import {
	type RainBlockingMode,
	TileLayerComponent,
} from "./tile-layer-component";

type TileLayers = ReadonlyArray<
	readonly [EntityId, TileLayerComponent]
>;

/**
 * The key a tile cell is stored under in every merged cell set here, so callers
 * testing a coordinate cannot spell the format differently than the sets do.
 *
 * @example
 * mergedBlockingCells(ecs, "rain-blocking").has(tileCellKey(gx, gy));
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
 * The authored classifications a precipitation channel can be sheltered by.
 *
 * One entry today: `"rain-blocking"` is the tri-state `TileLayerComponent`
 * already carries, and every channel maps onto it. It is a tuple rather than a
 * bare string so a future `"snow-blocking"` is added in one place and every
 * consumer reaches it through the derived union.
 */
const TILE_BLOCKING_CLASSES = ["rain-blocking"] as const;

export type TileBlockingClass =
	(typeof TILE_BLOCKING_CLASSES)[number];

/** Which tri-state field on a layer each classification is authored in. */
const BLOCKING_MODE: Readonly<
	Record<
		TileBlockingClass,
		(layer: TileLayerComponent) => RainBlockingMode
	>
> = {
	"rain-blocking": (layer) => layer.rainBlocking,
};

/**
 * The layers that keep a classification's precipitation out: those explicitly
 * marked `"blocks"`, plus the `"auto"` layers whose collision already stops the
 * player.
 *
 * This is the only place the tri-state is resolved against `collision`; every
 * shelter consumer goes through it so shelter and the inspector never disagree.
 */
export const blockingLayers = (
	ecs: ReadonlyECS,
	blocking: TileBlockingClass,
): ReadonlyArray<readonly [EntityId, TileLayerComponent]> =>
	tileLayers(ecs).filter(([, layer]) => {
		const mode = BLOCKING_MODE[blocking](layer);
		return (
			mode === "blocks" ||
			(mode === "auto" && layer.collision === "solid")
		);
	});

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
 * Every cell that keeps a classification's precipitation out, as `"gx,gy"` keys
 * — the classification of {@link blockingLayers}, not solidity.
 *
 * A precipitation particle tests against this rather than
 * {@link mergedSolidCells} so a tarpaulin marked `"blocks"` stops drops it does
 * not stop the player with, and a grate marked `"passes"` lets them through.
 *
 * @example
 * const blocked = mergedBlockingCells(ecs, "rain-blocking");
 * blocked.has(tileCellKey(gx, gy));
 */
export const mergedBlockingCells = (
	ecs: ReadonlyECS,
	blocking: TileBlockingClass,
): Set<string> => mergeCells(blockingLayers(ecs, blocking));

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
