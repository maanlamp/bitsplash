import { describe, expect, test } from "bun:test";
import { CAP_ROW } from "../src/engine/tilemap/autotile";
import { TileGrid } from "../src/engine/tilemap/grid";
import {
	HALF_TILE_SIZE,
	TILE_SIZE,
} from "../src/engine/tilemap/tile";
import {
	resolveSourcePixel,
	resolveWorldPixel,
} from "../src/editor/sprite/tile-paint";

const SRC = 16;
const opaque = () => 255;
const transparent = () => 0;

const filled = (
	cells: ReadonlyArray<readonly [number, number]>,
): TileGrid => {
	const grid = new TileGrid();
	for (const [x, y] of cells) {
		grid.setTile(x, y);
	}
	return grid;
};

describe("tileset paint-through inverse mapping", () => {
	// A 2×2 solid block makes its shared inner corner (1,1) a FULL tile, whose
	// sheet slot (col 2, row 1) has no rotation/flip — so the (u,v) unwrap is the
	// identity and the expected source pixel is hand-computable.
	const full = () =>
		filled([
			[0, 0],
			[1, 0],
			[0, 1],
			[1, 1],
		]);

	test("resolveSourcePixel maps an off-centre point of a FULL tile to its source pixel", () => {
		const pixel = resolveSourcePixel(
			full(),
			2,
			SRC,
			1,
			1,
			0.25,
			0.75,
			transparent,
		);
		expect(pixel).toEqual({ x: 2 * SRC + 4, y: 1 * SRC + 12 });
	});

	test("resolveWorldPixel converts a world point to the same source pixel", () => {
		// World (24,40): tile cell (1,1), in-tile fraction (0.25, 0.75).
		const wx = 1 * TILE_SIZE - HALF_TILE_SIZE + 0.25 * TILE_SIZE;
		const wy = 1 * TILE_SIZE - HALF_TILE_SIZE + 0.75 * TILE_SIZE;
		expect(wx).toBe(24);
		expect(wy).toBe(40);
		const pixel = resolveWorldPixel(
			full(),
			2,
			SRC,
			wx,
			wy,
			transparent,
		);
		expect(pixel).toEqual({ x: 2 * SRC + 4, y: 1 * SRC + 12 });
	});

	test("an empty autotile cell resolves to null", () => {
		const grid = new TileGrid();
		expect(resolveWorldPixel(grid, 2, SRC, 0, 0, opaque)).toBeNull();
	});

	test("the composite reader decides cap vs. fill", () => {
		// A horizontal pair (0,1),(1,1) makes corner (1,1) a bottom EDGE with a
		// STRAIGHT cap available once the sheet has a cap row (rows > CAP_ROW).
		const grid = filled([
			[0, 1],
			[1, 1],
		]);
		const rows = CAP_ROW + 1;
		const capPixel = resolveWorldPixel(
			grid,
			rows,
			SRC,
			TILE_SIZE,
			TILE_SIZE,
			opaque,
		);
		// Cap lives on CAP_ROW (row 2), col 0.
		expect(capPixel).toEqual({ x: 8, y: CAP_ROW * SRC + 8 });

		const fillPixel = resolveWorldPixel(
			grid,
			rows,
			SRC,
			TILE_SIZE,
			TILE_SIZE,
			transparent,
		);
		// With the cap transparent, it falls through to the fill (EDGE, row 0).
		expect(fillPixel).toEqual({ x: 2 * SRC + 8, y: 8 });
	});
});
