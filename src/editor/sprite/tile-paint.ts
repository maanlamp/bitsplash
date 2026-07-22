import { tileUV } from "../../engine/render/renderer-2d";
import { cornerSlots } from "../../engine/tilemap/autotile";
import type { TileGrid } from "../../engine/tilemap/grid";
import { HALF_TILE_SIZE, TILE_SIZE } from "../../engine/tilemap/tile";

export type SourcePixel = Readonly<{ x: number; y: number }>;

const clamp = (value: number, lo: number, hi: number): number =>
	Math.max(lo, Math.min(hi, value));

const quadToSource = (
	u: number,
	v: number,
	quarterTurns: number,
	flip: boolean,
): readonly [number, number] => {
	const uv = tileUV(quarterTurns, flip);
	const topU = uv[0]! * (1 - u) + uv[2]! * u;
	const topV = uv[1]! * (1 - u) + uv[3]! * u;
	const botU = uv[6]! * (1 - u) + uv[4]! * u;
	const botV = uv[7]! * (1 - u) + uv[5]! * u;
	return [topU * (1 - v) + botU * v, topV * (1 - v) + botV * v];
};

const tilePixel = (
	col: number,
	row: number,
	quarterTurns: number,
	flip: boolean,
	u: number,
	v: number,
	srcSize: number,
): SourcePixel => {
	const [su, sv] = quadToSource(u, v, quarterTurns, flip);
	return {
		x:
			col * srcSize + clamp(Math.floor(su * srcSize), 0, srcSize - 1),
		y:
			row * srcSize + clamp(Math.floor(sv * srcSize), 0, srcSize - 1),
	};
};

export const resolveSourcePixel = (
	grid: TileGrid,
	rows: number,
	srcSize: number,
	cx: number,
	cy: number,
	u: number,
	v: number,
	alphaAt: (x: number, y: number) => number,
): SourcePixel | null => {
	const { cap, fill } = cornerSlots(grid, cx, cy, rows);

	if (cap) {
		const pixel = tilePixel(
			cap.col,
			cap.row,
			cap.rot,
			cap.flip,
			u,
			v,
			srcSize,
		);
		if (alphaAt(pixel.x, pixel.y) > 0) {
			return pixel;
		}
	}

	if (!fill) {
		return null;
	}
	return tilePixel(
		fill.col,
		fill.row,
		fill.rot,
		fill.flip,
		u,
		v,
		srcSize,
	);
};

/**
 * The tileset paint-through inverse: map a world-space point in the preview back
 * to the source-sprite pixel it displays, or `null` when the covering autotile
 * cell is empty. Converts the world point to its tile cell and in-tile `(u, v)`
 * fraction, then delegates to {@link resolveSourcePixel} for the cap/fill
 * selection and UV unwrap. `alphaAt` reads the composite (what-you-see) alpha, so
 * a cap pixel wins only where the on-screen tile is actually opaque.
 *
 * Pure — the game-view panel supplies the world point (from the camera) and the
 * composite reader; this holds the whole cell/UV math so the mapping is unit
 * tested without a panel or a renderer.
 */
export const resolveWorldPixel = (
	grid: TileGrid,
	rows: number,
	srcSize: number,
	wx: number,
	wy: number,
	alphaAt: (x: number, y: number) => number,
): SourcePixel | null => {
	const cx = Math.floor((wx + HALF_TILE_SIZE) / TILE_SIZE);
	const cy = Math.floor((wy + HALF_TILE_SIZE) / TILE_SIZE);
	const x0 = cx * TILE_SIZE - HALF_TILE_SIZE;
	const y0 = cy * TILE_SIZE - HALF_TILE_SIZE;
	return resolveSourcePixel(
		grid,
		rows,
		srcSize,
		cx,
		cy,
		(wx - x0) / TILE_SIZE,
		(wy - y0) / TILE_SIZE,
		alphaAt,
	);
};
