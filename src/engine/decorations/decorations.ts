import type { EntityId, ReadonlyECS } from "../ecs";
import { hashCell } from "../hash";
import { loadImage } from "../load";
import type Renderer2D from "../render/renderer-2d";
import type { StaticBatch } from "../render/renderer-2d";
import { resolveRenderLayer } from "../render/render-layers";
import { solidTileLayers } from "../tilemap/occupancy";
import { HALF_TILE_SIZE, TILE_SIZE } from "../tilemap/tile";
import type { TileGrid } from "../tilemap/grid";

export abstract class Decorations {
	private density: number;
	protected atlas: HTMLImageElement | null = null;
	protected cols = 0;
	protected count = 0;
	protected dirty = true;
	private batchRenderer: Renderer2D | null = null;
	private trackedId: EntityId | null = null;
	private trackedVersion = -1;

	protected rendererChanged(renderer: Renderer2D): boolean {
		if (this.batchRenderer === renderer) {
			return false;
		}
		this.batchRenderer = renderer;
		this.dirty = true;
		return true;
	}

	constructor(atlasUrl: string, density: number) {
		this.density = density;
		void loadImage(atlasUrl).then((image) => {
			this.atlas = image;
			this.cols = Math.floor(image.naturalWidth / TILE_SIZE);
			const rows = Math.floor(image.naturalHeight / TILE_SIZE);
			this.count = this.cols * rows;
			this.dirty = true;
		});
	}

	abstract render(renderer: Renderer2D, ecs: ReadonlyECS): void;

	protected track(ecs: ReadonlyECS): TileGrid | null {
		const entry = solidTileLayers(ecs)[0] ?? null;
		const id = entry?.[0] ?? null;
		const grid = entry?.[1].grid ?? null;
		const version = grid?.version ?? -1;
		if (id !== this.trackedId || version !== this.trackedVersion) {
			this.trackedId = id;
			this.trackedVersion = version;
			this.dirty = true;
		}
		return grid;
	}

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
	private backLayer: string;
	private frontLayer: string;
	private jitter: number;
	private backBatch: StaticBatch | null = null;
	private frontBatch: StaticBatch | null = null;

	constructor(
		atlasUrl: string,
		backLayer: string,
		frontLayer: string,
		density: number,
		jitter: number,
	) {
		super(atlasUrl, density);
		this.backLayer = backLayer;
		this.frontLayer = frontLayer;
		this.jitter = jitter;
	}

	render(renderer: Renderer2D, ecs: ReadonlyECS): void {
		const grid = this.track(ecs);
		if (!grid || !this.ready()) {
			return;
		}
		const array = renderer.getTileArray(
			this.atlas!,
			this.cols,
			TILE_SIZE,
		);
		if (this.rendererChanged(renderer)) {
			this.backBatch = null;
			this.frontBatch = null;
		}
		if (!this.backBatch) {
			this.backBatch = renderer.createStaticBatch();
		}
		if (!this.frontBatch) {
			this.frontBatch = renderer.createStaticBatch();
		}
		if (this.dirty) {
			this.bake(grid);
			this.dirty = false;
		}
		renderer.drawStaticBatch(
			resolveRenderLayer(ecs, this.backLayer),
			this.backBatch,
			array.texture,
		);
		renderer.drawStaticBatch(
			resolveRenderLayer(ecs, this.frontLayer),
			this.frontBatch,
			array.texture,
		);
	}

	private bake(grid: TileGrid): void {
		this.backBatch!.clear();
		this.frontBatch!.clear();
		for (const [gx, gy] of grid.occupiedCells()) {
			if (grid.hasTile(gx, gy - 1)) {
				continue;
			}
			if (!this.present(gx, gy)) {
				continue;
			}
			const jitter =
				(hashCell(gx, gy, 4) % (2 * this.jitter + 1)) - this.jitter;
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
	private layer: string;
	private order: number;
	private batch: StaticBatch | null = null;

	constructor(
		atlasUrl: string,
		layer: string,
		density: number,
		order = 0,
	) {
		super(atlasUrl, density);
		this.layer = layer;
		this.order = order;
	}

	render(renderer: Renderer2D, ecs: ReadonlyECS): void {
		const grid = this.track(ecs);
		if (!grid || !this.ready()) {
			return;
		}
		const array = renderer.getTileArray(
			this.atlas!,
			this.cols,
			TILE_SIZE,
		);
		if (this.rendererChanged(renderer)) {
			this.batch = null;
		}
		if (!this.batch) {
			this.batch = renderer.createStaticBatch();
		}
		if (this.dirty) {
			this.bake(grid);
			this.dirty = false;
		}
		renderer.drawStaticBatch(
			resolveRenderLayer(ecs, this.layer, this.order),
			this.batch,
			array.texture,
		);
	}

	private bake(grid: TileGrid): void {
		this.batch!.clear();
		for (const [gx, gy] of grid.occupiedCells()) {
			if (!this.fullCorner(grid, gx, gy)) {
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

	private fullCorner(
		grid: TileGrid,
		gx: number,
		gy: number,
	): boolean {
		return (
			grid.hasTile(gx - 1, gy) &&
			grid.hasTile(gx, gy - 1) &&
			grid.hasTile(gx - 1, gy - 1)
		);
	}
}
