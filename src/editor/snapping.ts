import { TILE_SIZE } from "../engine/tilemap/tile";
import type { EntityAabb } from "./pick";

/**
 * A live alignment line produced when a moving entity's edge/center aligns to a
 * neighbour's edge/center (plan E2). `axis` is the axis the line runs along:
 * an `"x"` guide is a vertical line at `position` on x, spanning `start`→`end`
 * on y (and vice-versa).
 */
export type SnapGuide = Readonly<{
	axis: "x" | "y";
	position: number;
	start: number;
	end: number;
}>;

/**
 * Inputs to the one snap resolver. Snapping is always on; `enabled` carries the
 * momentary `Ctrl`-escape (the caller passes `false` while `Ctrl` is held this
 * gesture). `neighbors` are the world-space bounds of nearby entities to
 * smart-guide against — the caller excludes the moving set.
 */
export type SnapContext = Readonly<{
	enabled: boolean;
	grid: number;
	threshold: number;
	neighbors: ReadonlyArray<EntityAabb>;
}>;

/** A snapped position plus any smart-guide lines the snap engaged. */
export type SnapResult = Readonly<{
	x: number;
	y: number;
	guides: ReadonlyArray<SnapGuide>;
}>;

/** The default world-space distance within which a smart-guide engages. */
export const DEFAULT_SNAP_THRESHOLD = TILE_SIZE / 2;

const salient = (min: number, max: number): readonly number[] => [
	min,
	(min + max) / 2,
	max,
];

type NeighborRange = Readonly<{
	min: number;
	max: number;
	crossMin: number;
	crossMax: number;
}>;

type AxisPick = Readonly<{ delta: number; guide: SnapGuide | null }>;

/**
 * The snap adjustment for one axis: the smallest move that lands a salient
 * coordinate (min/center/max) of the moving bounds on either the nearest grid
 * line or a neighbour's edge/center. The grid candidate is always available;
 * neighbour candidates only within `threshold` — so object alignment wins when
 * closer, grid otherwise (the Figma posture).
 */
const pickAxis = (
	axis: "x" | "y",
	movingMin: number,
	movingMax: number,
	crossMin: number,
	crossMax: number,
	neighbors: ReadonlyArray<NeighborRange>,
	grid: number,
	threshold: number,
): AxisPick => {
	let best = Number.POSITIVE_INFINITY;
	let delta = 0;
	let guide: SnapGuide | null = null;
	for (const s of salient(movingMin, movingMax)) {
		const gridDelta = Math.round(s / grid) * grid - s;
		if (Math.abs(gridDelta) < Math.abs(best)) {
			best = gridDelta;
			delta = gridDelta;
			guide = null;
		}
		for (const n of neighbors) {
			for (const ns of salient(n.min, n.max)) {
				const nd = ns - s;
				if (
					Math.abs(nd) <= threshold &&
					Math.abs(nd) < Math.abs(best)
				) {
					best = nd;
					delta = nd;
					guide = {
						axis,
						position: ns,
						start: Math.min(crossMin, n.crossMin),
						end: Math.max(crossMax, n.crossMax),
					};
				}
			}
		}
	}
	return { delta, guide };
};

/**
 * The one bounds-aware snap resolver (plan E1/E2). Given the moving entity's
 * world-space `aabb` at the proposed `worldPoint` pivot, it snaps the nearest
 * salient point of the bounds to the nearest grid feature or neighbour, and
 * returns the adjusted pivot plus any alignment guides. A geometry-less entity
 * (`aabb === null`) degrades to snapping the pivot itself to the grid. When
 * `enabled` is false it is the identity.
 *
 * @example
 * const { x, y, guides } = snap(aabb, { x: 40, y: 40 }, {
 *   enabled: true, grid: 32, threshold: 16, neighbors: [],
 * });
 */
export const snap = (
	aabb: EntityAabb | null,
	worldPoint: Readonly<{ x: number; y: number }>,
	ctx: SnapContext,
): SnapResult => {
	if (!ctx.enabled) {
		return { x: worldPoint.x, y: worldPoint.y, guides: [] };
	}
	if (!aabb) {
		return {
			x: Math.round(worldPoint.x / ctx.grid) * ctx.grid,
			y: Math.round(worldPoint.y / ctx.grid) * ctx.grid,
			guides: [],
		};
	}
	const xNeighbors = ctx.neighbors.map((n) => ({
		min: n.minX,
		max: n.maxX,
		crossMin: n.minY,
		crossMax: n.maxY,
	}));
	const yNeighbors = ctx.neighbors.map((n) => ({
		min: n.minY,
		max: n.maxY,
		crossMin: n.minX,
		crossMax: n.maxX,
	}));
	const x = pickAxis(
		"x",
		aabb.minX,
		aabb.maxX,
		aabb.minY,
		aabb.maxY,
		xNeighbors,
		ctx.grid,
		ctx.threshold,
	);
	const y = pickAxis(
		"y",
		aabb.minY,
		aabb.maxY,
		aabb.minX,
		aabb.maxX,
		yNeighbors,
		ctx.grid,
		ctx.threshold,
	);
	const guides: SnapGuide[] = [];
	if (x.guide) {
		guides.push(x.guide);
	}
	if (y.guide) {
		guides.push(y.guide);
	}
	return {
		x: worldPoint.x + x.delta,
		y: worldPoint.y + y.delta,
		guides,
	};
};
