import { hashCell } from "../hash";
import { loadImage } from "../load";
import type { StaticBatch, TileSource } from "../renderer-2d";
import { type RenderContext, RenderSystem } from "../system";
import { HALF_TILE_SIZE, TILE_SIZE } from "../tile";
import {
	CAP_ROW,
	CAP_SPRITES,
	Cap,
	SHEET_COLUMNS,
	VARIANT_SPRITES,
	Variant,
	classifyCap,
	classifyCorner,
} from "../tilemap/autotile";
import type { TileGrid } from "../tilemap/grid";

export class TilemapRenderSystem implements RenderSystem {
	private grid: TileGrid;
	private layer: number;
	private tileset: TileSource | null = null;
	private batch: StaticBatch | null = null;
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
					const [tl, tr, br, bl] = this.sampleCorner(cx, cy);
					const { variant, rot } = classifyCorner(tl, tr, br, bl);
					if (variant === Variant.EMPTY) {
						continue;
					}
					const slot = VARIANT_SPRITES[variant]!;
					batch.tile(
						cx * TILE_SIZE - HALF_TILE_SIZE,
						cy * TILE_SIZE - HALF_TILE_SIZE,
						TILE_SIZE,
						slot.row * SHEET_COLUMNS + slot.col,
						slot.baseRot + rot,
					);
				}
			}

			if (rows > CAP_ROW) {
				for (let cy = minY; cy <= maxY + 1; cy++) {
					for (let cx = minX; cx <= maxX + 1; cx++) {
						const [tl, tr, br, bl] = this.sampleCorner(cx, cy);
						const cap = classifyCap(tl, tr, br, bl);
						if (!cap) {
							continue;
						}
						const flip =
							cap.cap === Cap.STRAIGHT
								? (hashCell(cx, cy, 1) & 1) === 1
								: cap.flip;
						batch.tile(
							cx * TILE_SIZE - HALF_TILE_SIZE,
							cy * TILE_SIZE - HALF_TILE_SIZE,
							TILE_SIZE,
							CAP_ROW * SHEET_COLUMNS + CAP_SPRITES[cap.cap]!,
							0,
							flip,
						);
					}
				}
			}
		}
		batch.commit();
	}

	private sampleCorner(
		cx: number,
		cy: number,
	): readonly [boolean, boolean, boolean, boolean] {
		return [
			this.grid.hasTile(cx - 1, cy - 1),
			this.grid.hasTile(cx, cy - 1),
			this.grid.hasTile(cx, cy),
			this.grid.hasTile(cx - 1, cy),
		];
	}
}
