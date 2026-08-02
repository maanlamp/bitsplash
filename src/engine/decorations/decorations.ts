import type { EntityId, ReadonlyECS } from "../ecs";
import { hashCell } from "../hash";
import { loadImage } from "../load";
import type Renderer2D from "../render/renderer-2d";
import type { StaticBatch } from "../render/renderer-2d";
import { resolveRenderLayer } from "../render/render-layers";
import { RendererResourceCache } from "../render/renderer-resource-cache";
import { solidTileLayers } from "../tilemap/occupancy";
import { HALF_TILE_SIZE, TILE_SIZE } from "../tilemap/tile";
import type { TileGrid } from "../tilemap/grid";

/**
 * Baked decoration geometry for one renderer. The `generation` records the
 * {@link Decorations.generation} value the batches were baked at; a mismatch
 * means the atlas loaded or the tracked grid changed and the batches must be
 * re-baked (per renderer, so N views never thrash a single shared batch).
 */
export type DecorationsState<S> = S & { generation: number };

/**
 * The render surface a {@link DecorationsRenderSystem} depends on: draw baked
 * decorations for a scene into one renderer. Kept generic-free so a render
 * system can hold any {@link Decorations} regardless of its per-renderer state
 * shape.
 */
export interface DecorationsRenderer {
	render(renderer: Renderer2D, ecs: ReadonlyECS): void;
}

export abstract class Decorations<
	S extends object = object,
> implements DecorationsRenderer {
	private density: number;
	protected atlas: HTMLImageElement | null = null;
	protected cols = 0;
	protected count = 0;
	/** Bumped whenever every renderer's batches must be re-baked. */
	protected generation = 0;
	private trackedId: EntityId | null = null;
	private trackedVersion = -1;
	private readonly states = new RendererResourceCache<
		DecorationsState<S>
	>(
		(renderer) => ({ ...this.createState(renderer), generation: -1 }),
		(state) => this.disposeState(state),
	);

	constructor(atlasUrl: string, density: number) {
		this.density = density;
		void loadImage(atlasUrl).then((image) => {
			this.atlas = image;
			this.cols = Math.floor(image.naturalWidth / TILE_SIZE);
			const rows = Math.floor(image.naturalHeight / TILE_SIZE);
			this.count = this.cols * rows;
			this.generation++;
		});
	}

	abstract render(renderer: Renderer2D, ecs: ReadonlyECS): void;

	/** Allocate this decoration's per-renderer batches. */
	protected abstract createState(renderer: Renderer2D): S;

	/** Free the GPU batches held by a per-renderer state. */
	protected abstract disposeState(state: S): void;

	/** The batches for `renderer`, allocated once and reused across frames. */
	protected stateFor(renderer: Renderer2D): DecorationsState<S> {
		return this.states.get(renderer);
	}

	protected track(ecs: ReadonlyECS): TileGrid | null {
		const entry = solidTileLayers(ecs)[0] ?? null;
		const id = entry?.[0] ?? null;
		const grid = entry?.[1].grid ?? null;
		const version = grid?.version ?? -1;
		if (id !== this.trackedId || version !== this.trackedVersion) {
			this.trackedId = id;
			this.trackedVersion = version;
			this.generation++;
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

type SurfaceState = { back: StaticBatch; front: StaticBatch };

export class SurfaceDecorations extends Decorations<SurfaceState> {
	private backLayer: string;
	private frontLayer: string;
	private jitter: number;

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

	protected createState(renderer: Renderer2D): SurfaceState {
		return {
			back: renderer.createStaticBatch(),
			front: renderer.createStaticBatch(),
		};
	}

	protected disposeState(state: SurfaceState): void {
		state.back.dispose();
		state.front.dispose();
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
		const state = this.stateFor(renderer);
		if (state.generation !== this.generation) {
			this.bake(grid, state);
			state.generation = this.generation;
		}
		renderer.drawStaticBatch(
			resolveRenderLayer(ecs, this.backLayer),
			state.back,
			array.texture,
		);
		renderer.drawStaticBatch(
			resolveRenderLayer(ecs, this.frontLayer),
			state.front,
			array.texture,
		);
	}

	private bake(grid: TileGrid, state: SurfaceState): void {
		state.back.clear();
		state.front.clear();
		grid.forEachCell((gx, gy) => {
			if (grid.hasTile(gx, gy - 1)) {
				return;
			}
			if (!this.present(gx, gy)) {
				return;
			}
			const jitter =
				(hashCell(gx, gy, 4) % (2 * this.jitter + 1)) - this.jitter;
			const batch =
				hashCell(gx, gy, 5) & 1 ? state.front : state.back;
			batch.cell(
				gx * TILE_SIZE + HALF_TILE_SIZE + jitter,
				gy * TILE_SIZE - HALF_TILE_SIZE,
				TILE_SIZE,
				this.slot(gx, gy),
				0,
				this.flip(gx, gy),
			);
		});
		state.back.commit();
		state.front.commit();
	}
}

type TileState = { batch: StaticBatch };

export class TileDecorations extends Decorations<TileState> {
	private layer: string;
	private order: number;

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

	protected createState(renderer: Renderer2D): TileState {
		return { batch: renderer.createStaticBatch() };
	}

	protected disposeState(state: TileState): void {
		state.batch.dispose();
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
		const state = this.stateFor(renderer);
		if (state.generation !== this.generation) {
			this.bake(grid, state);
			state.generation = this.generation;
		}
		renderer.drawStaticBatch(
			resolveRenderLayer(ecs, this.layer, this.order),
			state.batch,
			array.texture,
		);
	}

	private bake(grid: TileGrid, state: TileState): void {
		state.batch.clear();
		grid.forEachCell((gx, gy) => {
			if (!this.fullCorner(grid, gx, gy)) {
				return;
			}
			if (!this.present(gx, gy)) {
				return;
			}
			state.batch.tile(
				gx * TILE_SIZE - HALF_TILE_SIZE,
				gy * TILE_SIZE - HALF_TILE_SIZE,
				TILE_SIZE,
				this.slot(gx, gy),
				hashCell(gx, gy, 6) % 4,
				this.flip(gx, gy),
			);
		});
		state.batch.commit();
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
