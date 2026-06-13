import {
	SURFACE_DECORATION_DENSITY,
	SURFACE_DECORATION_JITTER,
	TILE_DECORATION_DENSITY,
} from "./constants";
import { hashCell } from "./hash";
import { loadImage } from "./load";
import type Renderer2D from "./renderer-2d";
import type { StaticBatch } from "./renderer-2d";
import { HALF_TILE_SIZE, TILE_SIZE } from "./tile";
import type { TileGrid } from "./tilemap/grid";

export abstract class Decorations {
	protected grid: TileGrid;
	private density: number;
	protected atlas: HTMLImageElement | null = null;
	protected cols = 0;
	protected count = 0;
	protected dirty = true;

	constructor(grid: TileGrid, atlasUrl: string, density: number) {
		this.grid = grid;
		this.density = density;
		void loadImage(atlasUrl).then((image) => {
			this.atlas = image;
			this.cols = Math.floor(image.naturalWidth / TILE_SIZE);
			const rows = Math.floor(image.naturalHeight / TILE_SIZE);
			this.count = this.cols * rows;
			this.dirty = true;
		});
		grid.onChange(() => {
			this.dirty = true;
		});
	}

	abstract render(renderer: Renderer2D): void;

	protected ready(): boolean {
		return this.atlas !== null && this.count > 0;
	}

	protected present(gx: number, gy: number): boolean {
		return hashCell(gx, gy, 1) / 0x1_0000_0000 < this.density;
	}

	protected slot(gx: number, gy: number): number {
		return hashCell(gx, gy, 2) % this.count;
	}

	protected flip(gx: number, gy: number): boolean {
		return (hashCell(gx, gy, 3) & 1) === 1;
	}
}

export class SurfaceDecorations extends Decorations {
	private backLayer: number;
	private frontLayer: number;
	private backBatch: StaticBatch | null = null;
	private frontBatch: StaticBatch | null = null;

	constructor(
		grid: TileGrid,
		atlasUrl: string,
		backLayer: number,
		frontLayer: number,
	) {
		super(grid, atlasUrl, SURFACE_DECORATION_DENSITY);
		this.backLayer = backLayer;
		this.frontLayer = frontLayer;
	}

	render(renderer: Renderer2D): void {
		if (!this.ready()) {
			return;
		}
		const array = renderer.getTileArray(
			this.atlas!,
			this.cols,
			TILE_SIZE,
		);
		if (!this.backBatch) {
			this.backBatch = renderer.createStaticBatch();
		}
		if (!this.frontBatch) {
			this.frontBatch = renderer.createStaticBatch();
		}
		if (this.dirty) {
			this.bake();
			this.dirty = false;
		}
		renderer.drawStaticBatch(
			this.backLayer,
			this.backBatch,
			array.texture,
		);
		renderer.drawStaticBatch(
			this.frontLayer,
			this.frontBatch,
			array.texture,
		);
	}

	private bake(): void {
		this.backBatch!.clear();
		this.frontBatch!.clear();
		for (const [gx, gy] of this.grid.occupiedCells()) {
			if (this.grid.hasTile(gx, gy - 1)) {
				continue;
			}
			if (!this.present(gx, gy)) {
				continue;
			}
			const jitter =
				(hashCell(gx, gy, 4) % (2 * SURFACE_DECORATION_JITTER + 1)) -
				SURFACE_DECORATION_JITTER;
			const batch =
				hashCell(gx, gy, 5) & 1 ? this.frontBatch! : this.backBatch!;
			batch.cell(
				gx * TILE_SIZE + HALF_TILE_SIZE + jitter,
				gy * TILE_SIZE - HALF_TILE_SIZE,
				TILE_SIZE,
				this.slot(gx, gy),
				0,
				this.flip(gx, gy),
			);
		}
		this.backBatch!.commit();
		this.frontBatch!.commit();
	}
}

export class TileDecorations extends Decorations {
	private layer: number;
	private batch: StaticBatch | null = null;

	constructor(grid: TileGrid, atlasUrl: string, layer: number) {
		super(grid, atlasUrl, TILE_DECORATION_DENSITY);
		this.layer = layer;
	}

	render(renderer: Renderer2D): void {
		if (!this.ready()) {
			return;
		}
		const array = renderer.getTileArray(
			this.atlas!,
			this.cols,
			TILE_SIZE,
		);
		if (!this.batch) {
			this.batch = renderer.createStaticBatch();
		}
		if (this.dirty) {
			this.bake();
			this.dirty = false;
		}
		renderer.drawStaticBatch(this.layer, this.batch, array.texture);
	}

	private bake(): void {
		this.batch!.clear();
		for (const [gx, gy] of this.grid.occupiedCells()) {
			if (!this.fullCorner(gx, gy)) {
				continue;
			}
			if (!this.present(gx, gy)) {
				continue;
			}
			this.batch!.tile(
				gx * TILE_SIZE - HALF_TILE_SIZE,
				gy * TILE_SIZE - HALF_TILE_SIZE,
				TILE_SIZE,
				this.slot(gx, gy),
				hashCell(gx, gy, 6) % 4,
				this.flip(gx, gy),
			);
		}
		this.batch!.commit();
	}

	private fullCorner(gx: number, gy: number): boolean {
		return (
			this.grid.hasTile(gx - 1, gy) &&
			this.grid.hasTile(gx, gy - 1) &&
			this.grid.hasTile(gx - 1, gy - 1)
		);
	}
}
