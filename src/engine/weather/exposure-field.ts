import type { EntityId, ReadonlyECS } from "../ecs";
import {
	blockingLayers,
	type TileBlockingClass,
	tileLayerSignature,
} from "../tilemap/occupancy";
import { TILE_SIZE } from "../tilemap/tile";
import type { TileLayerComponent } from "../tilemap/tile-layer-component";

/** Width of the derived window, in tiles. */
const EXPOSURE_WINDOW_TILES_X = 128;

/** Height of the derived window, in tiles. */
const EXPOSURE_WINDOW_TILES_Y = 96;

/**
 * Tile step the window origin snaps to. The window only moves — and the field
 * only rebuilds — when the camera crosses one of these boundaries, so ordinary
 * scrolling reuses the cached field.
 */
const EXPOSURE_WINDOW_QUANTUM_TILES = 16;

/**
 * Longest path, in tiles, the shelter distance field tracks. Anything further
 * from an opening (including everything the window cannot reach) reports this
 * distance, which is what makes a sealed interior read as deep muffle without a
 * special case.
 */
const EXPOSURE_MAX_TILE_DISTANCE = 64;

/** {@link EXPOSURE_MAX_TILE_DISTANCE} in world units. */
export const EXPOSURE_MAX_DISTANCE =
	EXPOSURE_MAX_TILE_DISTANCE * TILE_SIZE;

/**
 * How far, in tiles, openness accumulation looks for sky. Openings beyond this
 * still register as a shelter *distance* but contribute no openness and no
 * panning — a listener that deep is simply inside.
 */
export const EXPOSURE_RADIUS_TILES = 8;

type BlockingLayers = ReadonlyArray<
	readonly [EntityId, TileLayerComponent]
>;

/**
 * Everything a built {@link ExposureField} depends on: which layers took part
 * and what state their grids were in ({@link tileLayerSignature} over
 * {@link blockingLayers}, so a tri-state flip that changes *which* layers block
 * already changes the signature), and where the window sat.
 */
export type ExposureCacheKey = Readonly<{
	signature: string;
	originX: number;
	originY: number;
}>;

/**
 * Whether a cached field is stale for the key we would build now.
 *
 * Split out from the ECS so the invalidation rule is testable on its own.
 *
 * @example
 * exposureFieldNeedsRebuild(null, key); // true — nothing cached yet
 */
export const exposureFieldNeedsRebuild = (
	cached: ExposureCacheKey | null,
	next: ExposureCacheKey,
): boolean =>
	cached === null ||
	cached.signature !== next.signature ||
	cached.originX !== next.originX ||
	cached.originY !== next.originY;

const quantizeOrigin = (center: number, span: number): number => {
	const raw = center - span / 2;
	return (
		Math.floor(raw / EXPOSURE_WINDOW_QUANTUM_TILES) *
		EXPOSURE_WINDOW_QUANTUM_TILES
	);
};

/**
 * Top-left tile of the window that covers a world-space center point, snapped
 * to {@link EXPOSURE_WINDOW_QUANTUM_TILES}.
 */
const exposureWindowOrigin = (
	centerWorldX: number,
	centerWorldY: number,
): Readonly<{ originX: number; originY: number }> => ({
	originX: quantizeOrigin(
		Math.floor(centerWorldX / TILE_SIZE),
		EXPOSURE_WINDOW_TILES_X,
	),
	originY: quantizeOrigin(
		Math.floor(centerWorldY / TILE_SIZE),
		EXPOSURE_WINDOW_TILES_Y,
	),
});

/** One point's worth of derived exposure, all distances in world units. */
export type ExposureSample = Readonly<{
	/**
	 * Soft openness, 0..1: the weight of sky-exposed air among the air a
	 * listener at this point can actually see out through. 1 is standing in the
	 * open, 0 is sealed in.
	 */
	openness: number;
	/**
	 * Path distance to the nearest opening, clamped to
	 * {@link EXPOSURE_MAX_DISTANCE}.
	 */
	distance: number;
	/**
	 * Openness-weighted centroid of the nearby openings, or the sample point
	 * itself when there are none.
	 */
	centroidX: number;
	centroidY: number;
}>;

/**
 * Roof row for a column with no blocking tile at all. Deliberately the
 * largest `Int32Array` value rather than `MAX_SAFE_INTEGER`, which truncates to
 * `-1` on store and would make every open column read as roofed.
 */
const NO_ROOF = 0x7fff_ffff;

/**
 * How far a sample will slide to find air when it lands inside terrain, in tiles.
 *
 * Small on purpose: a listener a few tiles inside a hillside should read as the
 * pocket beside it, but one deep inside solid rock genuinely is sealed.
 */
const AIR_SEARCH_TILES = 4;

const SEALED: ExposureSample = {
	openness: 0,
	distance: EXPOSURE_MAX_DISTANCE,
	centroidX: 0,
	centroidY: 0,
};

/**
 * Derived shelter over a window of tiles, for one blocking classification:
 * which columns have a roof, which
 * air cells the sky reaches, how far every other air cell is from one, and how
 * open a given point feels.
 *
 * Nothing here is authored and nothing here is serialized — the field is built
 * from tile grids alone and lives in module state keyed by ECS, so the editor's
 * save tripwires never see it. Build it through {@link exposureField}, which
 * polls the cache key and rebuilds only when it changes.
 */
export class ExposureField {
	readonly key: ExposureCacheKey;

	private readonly originX: number;
	private readonly originY: number;
	private readonly heights: ReadonlyMap<number, number>;
	private readonly blocking: Uint8Array;
	private readonly exposed: Uint8Array;
	private readonly dist: Int32Array;
	private readonly stamp: Int32Array;
	private readonly localDist: Int32Array;
	private readonly scratchQueue: Int32Array;
	private stampId = 0;

	constructor(layers: BlockingLayers, key: ExposureCacheKey) {
		const w = EXPOSURE_WINDOW_TILES_X;
		const h = EXPOSURE_WINDOW_TILES_Y;
		const size = w * h;

		this.key = key;
		this.originX = key.originX;
		this.originY = key.originY;
		this.blocking = new Uint8Array(size);
		this.exposed = new Uint8Array(size);
		this.dist = new Int32Array(size).fill(EXPOSURE_MAX_TILE_DISTANCE);
		this.stamp = new Int32Array(size);
		this.localDist = new Int32Array(size);
		this.scratchQueue = new Int32Array(size);

		const heights = new Map<number, number>();
		for (const [, layer] of layers) {
			layer.grid.forEachCell((gx, gy) => {
				const top = heights.get(gx);
				if (top === undefined || gy < top) {
					heights.set(gx, gy);
				}
				const lx = gx - this.originX;
				const ly = gy - this.originY;
				if (lx >= 0 && lx < w && ly >= 0 && ly < h) {
					this.blocking[ly * w + lx] = 1;
				}
			});
		}
		this.heights = heights;

		const columnTop = new Int32Array(w);
		for (let lx = 0; lx < w; lx++) {
			columnTop[lx] = heights.get(this.originX + lx) ?? NO_ROOF;
		}

		const queue = new Int32Array(size);
		let tail = 0;
		for (let ly = 0; ly < h; ly++) {
			const gy = this.originY + ly;
			for (let lx = 0; lx < w; lx++) {
				const idx = ly * w + lx;
				if (this.blocking[idx] === 1 || columnTop[lx]! <= gy) {
					continue;
				}
				this.exposed[idx] = 1;
				this.dist[idx] = 0;
				queue[tail++] = idx;
			}
		}

		for (let head = 0; head < tail; head++) {
			const idx = queue[head]!;
			const next = this.dist[idx]! + 1;
			if (next > EXPOSURE_MAX_TILE_DISTANCE) {
				continue;
			}
			const lx = idx % w;
			const ly = (idx - lx) / w;
			if (lx > 0) {
				tail = this.relax(idx - 1, next, queue, tail);
			}
			if (lx < w - 1) {
				tail = this.relax(idx + 1, next, queue, tail);
			}
			if (ly > 0) {
				tail = this.relax(idx - w, next, queue, tail);
			}
			if (ly < h - 1) {
				tail = this.relax(idx + w, next, queue, tail);
			}
		}
	}

	/**
	 * Row of the topmost blocking tile in a column, or `null` when that column is
	 * open all the way down. Precipitation falls freely above the returned row
	 * and is sheltered below it.
	 *
	 * Unlike the distance field this covers every authored column, not just the
	 * window, so spawn and cull decisions can be made off-screen.
	 */
	roofHeight(gx: number): number | null {
		return this.heights.get(gx) ?? null;
	}

	/**
	 * Index of the nearest air cell to a local coordinate, or `null` when nothing
	 * within {@link AIR_SEARCH_TILES} is air.
	 *
	 * A listener is a camera centre, and a camera centre sits inside terrain
	 * routinely — panning the editor across a hillside, or a game camera framing a
	 * wall. Reporting a sealed room for those frames made the mix lurch between
	 * open and smothered as the centre crossed a tile edge, so instead the sample
	 * slides to the air beside it and reports the shelter of the space the
	 * listener is really standing in.
	 */
	private airNear(lx: number, ly: number): number | null {
		const w = EXPOSURE_WINDOW_TILES_X;
		const h = EXPOSURE_WINDOW_TILES_Y;
		if (this.blocking[ly * w + lx] === 0) {
			return ly * w + lx;
		}
		for (let r = 1; r <= AIR_SEARCH_TILES; r++) {
			for (let dy = -r; dy <= r; dy++) {
				for (let dx = -r; dx <= r; dx++) {
					if (Math.abs(dx) !== r && Math.abs(dy) !== r) {
						continue;
					}
					const cx = lx + dx;
					const cy = ly + dy;
					if (cx < 0 || cx >= w || cy < 0 || cy >= h) {
						continue;
					}
					const idx = cy * w + cx;
					if (this.blocking[idx] === 0) {
						return idx;
					}
				}
			}
		}
		return null;
	}

	/**
	 * Openness, shelter distance and opening centroid at a world-space point.
	 *
	 * Openness is the weighted share of sky-exposed cells among the air cells
	 * reachable within {@link EXPOSURE_RADIUS_TILES}, weighted `1 / (1 + steps)`.
	 * Because it is a share of *reachable* air rather than a hit test on the
	 * nearest opening, a single-tile hole in a roof reads as a small fraction
	 * that grows as you walk under it, never as a flip between sheltered and
	 * soaked.
	 */
	sample(worldX: number, worldY: number): ExposureSample {
		const w = EXPOSURE_WINDOW_TILES_X;
		const h = EXPOSURE_WINDOW_TILES_Y;
		const lx = Math.floor(worldX / TILE_SIZE) - this.originX;
		const ly = Math.floor(worldY / TILE_SIZE) - this.originY;
		if (lx < 0 || lx >= w || ly < 0 || ly >= h) {
			return { ...SEALED, centroidX: worldX, centroidY: worldY };
		}
		const start = this.airNear(lx, ly);
		if (start === null) {
			return { ...SEALED, centroidX: worldX, centroidY: worldY };
		}

		const stampId = ++this.stampId;
		this.stamp[start] = stampId;
		this.localDist[start] = 0;
		this.scratchQueue[0] = start;
		let tail = 1;
		let airWeight = 0;
		let skyWeight = 0;
		let centroidX = 0;
		let centroidY = 0;

		for (let head = 0; head < tail; head++) {
			const idx = this.scratchQueue[head]!;
			const d = this.localDist[idx]!;
			const weight = 1 / (1 + d);
			airWeight += weight;
			if (this.exposed[idx] === 1) {
				const cx = idx % w;
				const cy = (idx - cx) / w;
				skyWeight += weight;
				centroidX += weight * (this.originX + cx + 0.5) * TILE_SIZE;
				centroidY += weight * (this.originY + cy + 0.5) * TILE_SIZE;
			}
			if (d >= EXPOSURE_RADIUS_TILES) {
				continue;
			}
			const cx = idx % w;
			const cy = (idx - cx) / w;
			if (cx > 0) {
				tail = this.visit(idx - 1, d + 1, stampId, tail);
			}
			if (cx < w - 1) {
				tail = this.visit(idx + 1, d + 1, stampId, tail);
			}
			if (cy > 0) {
				tail = this.visit(idx - w, d + 1, stampId, tail);
			}
			if (cy < h - 1) {
				tail = this.visit(idx + w, d + 1, stampId, tail);
			}
		}

		return {
			openness: airWeight > 0 ? skyWeight / airWeight : 0,
			distance: this.dist[start]! * TILE_SIZE,
			centroidX: skyWeight > 0 ? centroidX / skyWeight : worldX,
			centroidY: skyWeight > 0 ? centroidY / skyWeight : worldY,
		};
	}

	private relax(
		idx: number,
		distance: number,
		queue: Int32Array,
		tail: number,
	): number {
		if (this.blocking[idx] === 1 || this.dist[idx]! <= distance) {
			return tail;
		}
		this.dist[idx] = distance;
		queue[tail] = idx;
		return tail + 1;
	}

	private visit(
		idx: number,
		distance: number,
		stampId: number,
		tail: number,
	): number {
		if (this.blocking[idx] === 1 || this.stamp[idx] === stampId) {
			return tail;
		}
		this.stamp[idx] = stampId;
		this.localDist[idx] = distance;
		this.scratchQueue[tail] = idx;
		return tail + 1;
	}
}

const fields = new WeakMap<
	ReadonlyECS,
	Map<TileBlockingClass, ExposureField>
>();

/**
 * The current {@link ExposureField} for a world and a blocking classification,
 * rebuilt when that classification's tile layers or the window moved and reused
 * otherwise.
 *
 * One field per classification, cached separately, so a channel sheltered by a
 * different set of layers than rain gets its own geometry rather than sharing
 * rain's.
 *
 * Safe to call several times a frame: the cache key is cheap and callers that
 * change nothing get the same instance back.
 *
 * @example
 * const field = exposureField(ecs, x, y, "rain-blocking");
 * const { openness } = field.sample(player.x, player.y);
 */
export const exposureField = (
	ecs: ReadonlyECS,
	centerX: number,
	centerY: number,
	blocking: TileBlockingClass,
): ExposureField => {
	const layers = blockingLayers(ecs, blocking);
	const { originX, originY } = exposureWindowOrigin(centerX, centerY);
	const next: ExposureCacheKey = {
		signature: tileLayerSignature(layers),
		originX,
		originY,
	};
	let byClass = fields.get(ecs);
	if (!byClass) {
		byClass = new Map();
		fields.set(ecs, byClass);
	}
	const cached = byClass.get(blocking) ?? null;
	if (!exposureFieldNeedsRebuild(cached?.key ?? null, next)) {
		return cached!;
	}
	const field = new ExposureField(layers, next);
	byClass.set(blocking, field);
	return field;
};
