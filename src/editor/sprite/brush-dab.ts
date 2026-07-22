/** A brush footprint silhouette. */
export type BrushShape = "round" | "square";

/** An integer cell offset `(dx, dy)` relative to the dab centre. */
export type CellOffset = readonly [number, number];

/**
 * The smallest expressible brush size. A size of `1` is a single centre pixel;
 * shapes with a non-positive or fractional request are floored to a valid size.
 */
export const MIN_BRUSH_SIZE = 1;

const cache = new Map<string, ReadonlyArray<CellOffset>>();

/**
 * Slight inward bias on the disk radius so small round brushes read as circles
 * rather than squares: without it a size-3 disk fills its whole 3×3 bounding box
 * (indistinguishable from the square brush). The bias clips the four corners at
 * size 3 (a plus), rounds the corners at size 4, and leaves larger disks as
 * clean circles. A conventional pixel-editor default — tune to taste.
 */
const RADIUS_BIAS = 0.5;

const build = (
	shape: BrushShape,
	size: number,
): ReadonlyArray<CellOffset> => {
	const s = Math.max(MIN_BRUSH_SIZE, Math.floor(size));
	if (s === 1) {
		return [[0, 0]];
	}
	const origin = Math.floor((s - 1) / 2);
	const half = s / 2;
	const threshold = half * half - RADIUS_BIAS;
	const offsets: CellOffset[] = [];
	for (let iy = 0; iy < s; iy++) {
		for (let ix = 0; ix < s; ix++) {
			if (shape === "round") {
				const dx = ix + 0.5 - half;
				const dy = iy + 0.5 - half;
				if (dx * dx + dy * dy > threshold) {
					continue;
				}
			}
			offsets.push([ix - origin, iy - origin]);
		}
	}
	return offsets;
};

/**
 * The set of cell offsets a single brush dab covers for the given shape and
 * size, centred on the dab pixel. Square dabs cover their whole `size × size`
 * bounding box; round dabs cover a filled disk of that diameter.
 *
 * Results are memoised per `(shape, size)` — the offsets are stamped once per
 * painted cell, so a stroke recomputes the footprint thousands of times.
 *
 * @example
 * dabOffsets("square", 1); // [[0, 0]]
 * dabOffsets("square", 2); // 2×2 block, [[0,0],[1,0],[0,1],[1,1]]
 */
export const dabOffsets = (
	shape: BrushShape,
	size: number,
): ReadonlyArray<CellOffset> => {
	const key = `${shape}:${Math.max(MIN_BRUSH_SIZE, Math.floor(size))}`;
	const hit = cache.get(key);
	if (hit) {
		return hit;
	}
	const built = build(shape, size);
	cache.set(key, built);
	return built;
};
