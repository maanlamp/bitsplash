import type Renderer2D from "../../engine/render/renderer-2d";
import type {
	StaticBatch,
	TileSource,
} from "../../engine/render/renderer-2d";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import {
	SHEET_COLUMNS,
	bakeAutotile,
} from "../../engine/tilemap/autotile";
import type { TileGrid } from "../../engine/tilemap/grid";

export class TilesetPreviewSystem implements RenderSystem {
	private batch: StaticBatch | null = null;
	private batchRenderer: Renderer2D | null = null;
	private version = -1;

	constructor(
		private grid: TileGrid,
		private tileset: TileSource,
		private layer: number,
	) {}

	render({ renderer }: RenderContext): void {
		const width =
			"naturalWidth" in this.tileset
				? this.tileset.naturalWidth
				: this.tileset.width;
		if (width === 0) {
			return;
		}
		const srcSize = width / SHEET_COLUMNS;
		const array = renderer.getTileArray(
			this.tileset,
			SHEET_COLUMNS,
			srcSize,
		);
		if (this.batchRenderer !== renderer) {
			this.batchRenderer = renderer;
			this.batch = null;
		}
		if (!this.batch) {
			this.batch = renderer.createStaticBatch();
			this.version = -1;
		}
		if (this.version !== this.grid.version) {
			bakeAutotile(this.batch, this.grid, array.rows);
			this.version = this.grid.version;
		}
		renderer.drawStaticBatch(this.layer, this.batch, array.texture);
	}
}
