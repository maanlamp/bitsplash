import {
	type FreeTransformParams,
	applyAffine,
	buildAffine,
} from "./free-transform";

/** A point in canvas cell coordinates. */
export type HandlePoint = Readonly<{ x: number; y: number }>;

/** The draggable parts of the free-transform gizmo. */
export type HandleId =
	| "move"
	| "pivot"
	| "rotate"
	| "nw"
	| "n"
	| "ne"
	| "e"
	| "se"
	| "s"
	| "sw"
	| "w";

/** The rectangle a transform is applied to, in canvas cells. */
export type TransformRect = Readonly<{
	originX: number;
	originY: number;
	width: number;
	height: number;
}>;

/**
 * The gizmo geometry in canvas cells: the four transformed corners (a
 * parallelogram once rotate/skew are non-zero), the four edge midpoints, the
 * pivot (fixed under the transform, so it is just `pivot`), and a rotate knob
 * offset outward past the top edge. Pure — the overlay renderer and the
 * interactive tool both derive their positions from this one function so the
 * drawn handles and the hit-tested handles can never drift.
 */
export const transformHandlePoints = (
	rect: TransformRect,
	params: FreeTransformParams,
	pivot: HandlePoint,
): Readonly<{
	nw: HandlePoint;
	n: HandlePoint;
	ne: HandlePoint;
	e: HandlePoint;
	se: HandlePoint;
	s: HandlePoint;
	sw: HandlePoint;
	w: HandlePoint;
	center: HandlePoint;
	pivot: HandlePoint;
	rotate: HandlePoint;
}> => {
	const m = buildAffine(params, pivot.x, pivot.y);
	const { originX: ox, originY: oy, width, height } = rect;
	const nw = applyAffine(m, ox, oy);
	const ne = applyAffine(m, ox + width, oy);
	const se = applyAffine(m, ox + width, oy + height);
	const sw = applyAffine(m, ox, oy + height);
	const center = applyAffine(m, ox + width / 2, oy + height / 2);
	const mid = (a: HandlePoint, b: HandlePoint): HandlePoint => ({
		x: (a.x + b.x) / 2,
		y: (a.y + b.y) / 2,
	});
	const n = mid(nw, ne);
	const e = mid(ne, se);
	const s = mid(se, sw);
	const w = mid(sw, nw);
	// The rotate knob sits a little beyond the top edge, along the top→centre axis.
	const rotate = {
		x: n.x + (n.x - center.x) * 0.35,
		y: n.y + (n.y - center.y) * 0.35,
	};
	return { nw, n, ne, e, se, s, sw, w, center, pivot, rotate };
};

const dist2 = (a: HandlePoint, b: HandlePoint): number => {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return dx * dx + dy * dy;
};

/**
 * Which handle a canvas point hits, or `null` for empty space. Point handles
 * (pivot, rotate, corners, edges) win within `radius` cells, pivot and rotate
 * first; failing that, a point inside the transformed quad is the body
 * (`"move"`). `radius` is supplied by the caller in cell units (typically a few
 * screen pixels converted through the camera zoom).
 */
export const hitTestHandle = (
	rect: TransformRect,
	params: FreeTransformParams,
	pivot: HandlePoint,
	point: HandlePoint,
	radius: number,
): HandleId | null => {
	const h = transformHandlePoints(rect, params, pivot);
	const r2 = radius * radius;
	const ordered: ReadonlyArray<readonly [HandleId, HandlePoint]> = [
		["pivot", h.pivot],
		["rotate", h.rotate],
		["nw", h.nw],
		["ne", h.ne],
		["se", h.se],
		["sw", h.sw],
		["n", h.n],
		["e", h.e],
		["s", h.s],
		["w", h.w],
	];
	let best: HandleId | null = null;
	let bestD = r2;
	for (const [id, p] of ordered) {
		const d = dist2(p, point);
		if (d <= bestD) {
			bestD = d;
			best = id;
		}
	}
	if (best) {
		return best;
	}
	return pointInQuad(point, h.nw, h.ne, h.se, h.sw) ? "move" : null;
};

const pointInQuad = (
	p: HandlePoint,
	a: HandlePoint,
	b: HandlePoint,
	c: HandlePoint,
	d: HandlePoint,
): boolean => {
	const sign = (
		o: HandlePoint,
		u: HandlePoint,
		v: HandlePoint,
	): number => (u.x - o.x) * (v.y - o.y) - (u.y - o.y) * (v.x - o.x);
	const s1 = sign(a, b, p);
	const s2 = sign(b, c, p);
	const s3 = sign(c, d, p);
	const s4 = sign(d, a, p);
	const hasNeg = s1 < 0 || s2 < 0 || s3 < 0 || s4 < 0;
	const hasPos = s1 > 0 || s2 > 0 || s3 > 0 || s4 > 0;
	return !(hasNeg && hasPos);
};
