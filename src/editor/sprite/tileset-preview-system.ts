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
	private unsubscribeRestored: (() => void) | null = null;
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
		// The batch's VAO/VBO belong to the renderer's GL context; a cross-window
		// move (or context loss) rebuilds it, so re-bake on the next frame.
		if (this.batchRenderer !== renderer) {
			this.unsubscribeRestored?.();
			this.batchRenderer = renderer;
			this.batch = null;
			this.unsubscribeRestored = renderer.onContextRestored(() => {
				this.batch = null;
			});
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
