import type { EntityId, ReadonlyECS } from "../ecs";
import type { GridBounds } from "./grid";
import {
	type RainBlockingMode,
	TileLayerComponent,
} from "./tile-layer-component";

export { tileCellKey } from "./grid";

type TileLayers = ReadonlyArray<
	readonly [EntityId, TileLayerComponent]
>;

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
	tileLayers(ecs).filter(([, layer]) => blocks(layer, blocking));

const blocks = (
	layer: TileLayerComponent,
	blocking: TileBlockingClass,
): boolean => {
	const mode = BLOCKING_MODE[blocking](layer);
	return (
		mode === "blocks" ||
		(mode === "auto" && layer.collision === "solid")
	);
};

export const isSolidCell = (
	ecs: ReadonlyECS,
	gx: number,
	gy: number,
): boolean =>
	solidTileLayers(ecs).some(([, layer]) =>
		layer.grid.hasTile(gx, gy),
	);

/**
 * Which layers a merged view is built from: every tile layer, the solid ones, or
 * the ones blocking one precipitation classification.
 */
type CellKind = "all" | "solid" | TileBlockingClass;

const included = (
	layer: TileLayerComponent,
	kind: CellKind,
): boolean => {
	if (kind === "all") {
		return true;
	}
	if (kind === "solid") {
		return layer.collision === "solid";
	}
	return blocks(layer, kind);
};

/**
 * One merged view of a world's tile layers — the union of their cells and the
 * extent that union spans — rebuilt only when the contributing layers or their
 * grid versions change.
 *
 * Every particle, arrow and agent testing tiles this frame shares one of these,
 * so the merge cost is paid on paint rather than per frame: the staleness check
 * walks the layer list comparing ids and versions in place and allocates
 * nothing.
 */
class MergedCells {
	private readonly ids: EntityId[] = [];
	private readonly versions: number[] = [];
	private count = -1;
	private readonly box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
	private empty = true;

	readonly cells = new Set<number>();

	bounds(): GridBounds | null {
		return this.empty ? null : this.box;
	}

	refresh(ecs: ReadonlyECS, kind: CellKind): void {
		const layers = tileLayers(ecs);
		let n = 0;
		let stale = false;
		for (let i = 0; i < layers.length; i++) {
			const entry = layers[i]!;
			const layer = entry[1];
			if (!included(layer, kind)) {
				continue;
			}
			if (
				this.ids[n] !== entry[0] ||
				this.versions[n] !== layer.grid.version
			) {
				stale = true;
			}
			n++;
		}
		if (!stale && n === this.count) {
			return;
		}
		this.rebuild(layers, kind, n);
	}

	private rebuild(
		layers: TileLayers,
		kind: CellKind,
		count: number,
	): void {
		this.count = count;
		this.ids.length = count;
		this.versions.length = count;
		this.cells.clear();
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		let n = 0;
		for (let i = 0; i < layers.length; i++) {
			const entry = layers[i]!;
			const layer = entry[1];
			if (!included(layer, kind)) {
				continue;
			}
			this.ids[n] = entry[0];
			this.versions[n] = layer.grid.version;
			n++;
			for (const key of layer.grid.cellKeys()) {
				this.cells.add(key);
			}
			const b = layer.grid.bounds();
			if (!b) {
				continue;
			}
			minX = Math.min(minX, b.minX);
			minY = Math.min(minY, b.minY);
			maxX = Math.max(maxX, b.maxX);
			maxY = Math.max(maxY, b.maxY);
		}
		this.empty = minX === Infinity;
		this.box.minX = minX;
		this.box.minY = minY;
		this.box.maxX = maxX;
		this.box.maxY = maxY;
	}
}

const merged = new WeakMap<ReadonlyECS, Map<CellKind, MergedCells>>();

const mergedFor = (ecs: ReadonlyECS, kind: CellKind): MergedCells => {
	let byKind = merged.get(ecs);
	if (!byKind) {
		byKind = new Map();
		merged.set(ecs, byKind);
	}
	let view = byKind.get(kind);
	if (!view) {
		view = new MergedCells();
		byKind.set(kind, view);
	}
	view.refresh(ecs, kind);
	return view;
};

/** Every solid layer's cells, as {@link tileCellKey} values. */
export const mergedSolidCells = (
	ecs: ReadonlyECS,
): ReadonlySet<number> => mergedFor(ecs, "solid").cells;

/**
 * Every cell that keeps a classification's precipitation out, as
 * {@link tileCellKey} values — the classification of {@link blockingLayers},
 * not solidity.
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
): ReadonlySet<number> => mergedFor(ecs, blocking).cells;

/**
 * The extent every solid layer spans, or `null` when none has a tile.
 *
 * The object is owned by the cache and rewritten in place when the layers
 * change — read it within the frame rather than retaining it.
 */
export const solidBounds = (ecs: ReadonlyECS): GridBounds | null =>
	mergedFor(ecs, "solid").bounds();

/** As {@link solidBounds}, over every tile layer regardless of collision. */
export const tileBounds = (ecs: ReadonlyECS): GridBounds | null =>
	mergedFor(ecs, "all").bounds();
