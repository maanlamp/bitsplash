import type { EntityId } from "../ecs";
import type { StaticBatch } from "../render/renderer-2d";
import { resolveRenderLayer } from "../render/render-layers";
import { RendererResourceCache } from "../render/renderer-resource-cache";
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
	tileset: string;
};

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
			const image = assetManager.getImage(layer.tilesetRef.path);
			if (!image || image.naturalWidth === 0) {
				continue;
			}
			const autotile = isAutotileTileset(layer.tilesetRef.path);
			const columns = autotile ? SHEET_COLUMNS : 1;
			const srcSize = image.naturalWidth / columns;
			const array = renderer.getTileArray(image, columns, srcSize);
			let entry = batches.get(id);
			if (!entry || entry.tileset !== layer.tilesetRef.path) {
				entry = {
					batch: renderer.createStaticBatch(),
					version: -1,
					tileset: layer.tilesetRef.path,
				};
				batches.set(id, entry);
			}
			if (entry.version !== layer.grid.version) {
				if (autotile) {
					bakeAutotile(entry.batch, layer.grid, array.rows);
				} else {
					this.bakeSingle(entry.batch, layer.grid);
				}
				entry.version = layer.grid.version;
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
