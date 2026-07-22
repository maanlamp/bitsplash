import type { EntityId } from "../ecs";
import type { StaticBatch, TileSource } from "../render/renderer-2d";
import { resolveRenderLayer } from "../render/render-layers";
import { RendererResourceCache } from "../render/renderer-resource-cache";
import { isBspriteUrl } from "../sprite/sprite-asset-cache";
import { type RenderContext, RenderSystem } from "../system";
import {
	SHEET_COLUMNS,
	bakeAutotile,
	isAutotileTileset,
} from "./autotile";
import type { TileGrid } from "./grid";
import { TILE_SIZE } from "./tile";
import { TileLayerComponent } from "./tile-layer-component";

type LayerBatch = {
	batch: StaticBatch;
	version: number;
	rows: number;
	tileset: string;
};

const tileSourceWidth = (source: TileSource): number =>
	"naturalWidth" in source ? source.naturalWidth : source.width;

/**
 * True when a baked layer batch must be re-baked: either its grid changed
 * (`version`) or the tile-array it was built from now reports a different row
 * count. The latter is the hot-reload trigger — an edited tileset can reload at
 * a new height (more/fewer tile rows) without the grid version changing, and an
 * autotile bake's slot math depends on `rows`, so a row change alone must
 * re-bake. A fresh entry is created with `version: -1, rows: -1`, so its first
 * poll always re-bakes.
 */
export const tileBatchNeedsRebake = (
	entry: Readonly<{ version: number; rows: number }>,
	gridVersion: number,
	rows: number,
): boolean => entry.version !== gridVersion || entry.rows !== rows;

export class TilemapRenderSystem implements RenderSystem {
	private readonly caches = new RendererResourceCache<
		Map<EntityId, LayerBatch>
	>(
		() => new Map(),
		(batches) => {
			for (const entry of batches.values()) {
				entry.batch.dispose();
			}
		},
	);

	render({ renderer, ecs, assetManager }: RenderContext): void {
		const batches = this.caches.get(renderer);
		const seen = new Set<EntityId>();
		for (const [id, layer] of ecs.query(TileLayerComponent)) {
			seen.add(id);
			if (!layer.visible || !layer.tilesetRef.path) {
				continue;
			}
			const path = layer.tilesetRef.path;
			let image: TileSource;
			let columns: number;
			if (isBspriteUrl(path)) {
				const asset = assetManager.sprites.get(path);
				if (!asset) {
					continue;
				}
				image = asset.image;
				columns = asset.tileset()?.columns ?? 1;
			} else {
				const legacy = assetManager.getImage(path);
				if (!legacy || legacy.naturalWidth === 0) {
					continue;
				}
				image = legacy;
				columns = isAutotileTileset(path) ? SHEET_COLUMNS : 1;
			}
			const autotile = columns === SHEET_COLUMNS;
			const srcSize = tileSourceWidth(image) / columns;
			const array = renderer.getTileArray(image, columns, srcSize);
			let entry = batches.get(id);
			if (!entry || entry.tileset !== path) {
				entry = {
					batch: renderer.createStaticBatch(),
					version: -1,
					rows: -1,
					tileset: path,
				};
				batches.set(id, entry);
			}
			if (
				tileBatchNeedsRebake(entry, layer.grid.version, array.rows)
			) {
				if (autotile) {
					bakeAutotile(entry.batch, layer.grid, array.rows);
				} else {
					this.bakeSingle(entry.batch, layer.grid);
				}
				entry.version = layer.grid.version;
				entry.rows = array.rows;
			}
			renderer.drawStaticBatch(
				resolveRenderLayer(ecs, layer.renderLayer, layer.order),
				entry.batch,
				array.texture,
			);
		}
		for (const id of batches.keys()) {
			if (!seen.has(id)) {
				batches.delete(id);
			}
		}
	}

	private bakeSingle(batch: StaticBatch, grid: TileGrid): void {
		batch.clear();
		for (const [gx, gy] of grid.occupiedCells()) {
			batch.tile(
				gx * TILE_SIZE,
				gy * TILE_SIZE,
				TILE_SIZE,
				0,
				0,
				false,
			);
		}
		batch.commit();
	}
}
