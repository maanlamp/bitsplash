import type { EntityId } from "../ecs";
import type Renderer2D from "../render/renderer-2d";
import type { StaticBatch } from "../render/renderer-2d";
import { resolveRenderLayer } from "../render/render-layers";
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
	private batches = new Map<EntityId, LayerBatch>();
	private batchRenderer: Renderer2D | null = null;

	render({ renderer, ecs, assetManager }: RenderContext): void {
		if (this.batchRenderer !== renderer) {
			this.batchRenderer = renderer;
			this.batches.clear();
		}
		const seen = new Set<EntityId>();
		for (const [id, layer] of ecs.query(TileLayerComponent)) {
			seen.add(id);
			if (!layer.visible || !layer.tileset) {
				continue;
			}
			const image = assetManager.getImage(layer.tileset);
			if (!image || image.naturalWidth === 0) {
				continue;
			}
			const autotile = isAutotileTileset(layer.tileset);
			const columns = autotile ? SHEET_COLUMNS : 1;
			const srcSize = image.naturalWidth / columns;
			const array = renderer.getTileArray(image, columns, srcSize);
			let entry = this.batches.get(id);
			if (!entry || entry.tileset !== layer.tileset) {
				entry = {
					batch: renderer.createStaticBatch(),
					version: -1,
					tileset: layer.tileset,
				};
				this.batches.set(id, entry);
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
		for (const id of this.batches.keys()) {
			if (!seen.has(id)) {
				this.batches.delete(id);
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
