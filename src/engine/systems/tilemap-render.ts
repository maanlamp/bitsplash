import { loadImage } from "../load";
import type Renderer2D from "../renderer-2d";
import type { StaticBatch, TileSource } from "../renderer-2d";
import { type RenderContext, RenderSystem } from "../system";
import { HALF_TILE_SIZE, TILE_SIZE } from "../tile";
import { SHEET_COLUMNS, cornerSlots } from "../tilemap/autotile";
import type { TileGrid } from "../tilemap/grid";

export class TilemapRenderSystem implements RenderSystem {
	private grid: TileGrid;
	private layer: number;
	private tileset: TileSource | null = null;
	private batch: StaticBatch | null = null;
	private batchRenderer: Renderer2D | null = null;
	private dirty = true;

	constructor(
		grid: TileGrid,
		tileset: string | TileSource,
		layer: number,
	) {
		this.grid = grid;
		this.layer = layer;
		if (typeof tileset === "string") {
			void loadImage(tileset).then((image) => {
				this.tileset = image;
				this.dirty = true;
			});
		} else {
			this.tileset = tileset;
		}
		grid.onChange(() => {
			this.dirty = true;
		});
	}

	render({ renderer }: RenderContext): void {
		const tileset = this.tileset;
		if (!tileset) {
			return;
		}
		const width =
			"naturalWidth" in tileset
				? tileset.naturalWidth
				: tileset.width;
		if (width === 0) {
			return;
		}
		const srcSize = width / SHEET_COLUMNS;
		const array = renderer.getTileArray(
			tileset,
			SHEET_COLUMNS,
			srcSize,
		);
		if (this.batchRenderer !== renderer) {
			this.batch = null;
			this.batchRenderer = renderer;
			this.dirty = true;
		}
		if (!this.batch) {
			this.batch = renderer.createStaticBatch();
		}
		if (this.dirty) {
			this.bake(this.batch, array.rows);
			this.dirty = false;
		}
		renderer.drawStaticBatch(this.layer, this.batch, array.texture);
	}

	private bake(batch: StaticBatch, rows: number): void {
		batch.clear();
		const bounds = this.grid.bounds();
		if (bounds) {
			const { minX, minY, maxX, maxY } = bounds;
			for (let cy = minY; cy <= maxY + 1; cy++) {
				for (let cx = minX; cx <= maxX + 1; cx++) {
					const { fill } = cornerSlots(this.grid, cx, cy, rows);
					if (!fill) {
						continue;
					}
					batch.tile(
						cx * TILE_SIZE - HALF_TILE_SIZE,
						cy * TILE_SIZE - HALF_TILE_SIZE,
						TILE_SIZE,
						fill.row * SHEET_COLUMNS + fill.col,
						fill.rot,
						fill.flip,
					);
				}
			}

			for (let cy = minY; cy <= maxY + 1; cy++) {
				for (let cx = minX; cx <= maxX + 1; cx++) {
					const { cap } = cornerSlots(this.grid, cx, cy, rows);
					if (!cap) {
						continue;
					}
					batch.tile(
						cx * TILE_SIZE - HALF_TILE_SIZE,
						cy * TILE_SIZE - HALF_TILE_SIZE,
						TILE_SIZE,
						cap.row * SHEET_COLUMNS + cap.col,
						cap.rot,
						cap.flip,
					);
				}
			}
		}
		batch.commit();
	}
}
