import type { PixelBuffer } from "./pixel-buffer";

/** An integer image cell. */
export type Cell = readonly [number, number];

/**
 * Chebyshev (max-channel) RGBA distance between two pixels, `0..255`. A pixel
 * matches the fill seed when this is `<= tolerance`, so tolerance `0` fills only
 * exact-colour cells and tolerance `255` fills everything.
 */
const distance = (
	data: Uint8ClampedArray,
	i: number,
	r: number,
	g: number,
	b: number,
	a: number,
): number =>
	Math.max(
		Math.abs(data[i]! - r),
		Math.abs(data[i + 1]! - g),
		Math.abs(data[i + 2]! - b),
		Math.abs(data[i + 3]! - a),
	);

/**
 * Compute the cells a bucket fill would cover on `pixels`, seeded at
 * `(seedX, seedY)`.
 *
 * - `contiguous`: 4-connected flood from the seed over cells within `tolerance`
 *   of the seed colour.
 * - non-`contiguous` (global): every cell within `tolerance` of the seed colour,
 *   regardless of connectivity.
 *
 * The seed colour is read from the cel itself (an absent/transparent cel reads
 * as `rgba(0,0,0,0)`, so filling empty space works). Returns the seed's own cell
 * even at tolerance `0`; returns nothing when the seed is out of bounds. Pure:
 * it reads pixels and returns cells, writing nothing — the caller stamps the
 * result through the paint path so ink and symmetry still apply.
 *
 * @example
 * computeFill(cel, 0, 0, 0, true); // contiguous same-colour region from (0,0)
 */
export const computeFill = (
	pixels: PixelBuffer,
	seedX: number,
	seedY: number,
	tolerance: number,
	contiguous: boolean,
): ReadonlyArray<Cell> => {
	const { width, height, data } = pixels;
	if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) {
		return [];
	}
	const seed = (seedY * width + seedX) * 4;
	const r = data[seed]!;
	const g = data[seed + 1]!;
	const b = data[seed + 2]!;
	const a = data[seed + 3]!;
	const matches = (x: number, y: number): boolean =>
		distance(data, (y * width + x) * 4, r, g, b, a) <= tolerance;

	if (!contiguous) {
		const cells: Cell[] = [];
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				if (matches(x, y)) {
					cells.push([x, y]);
				}
			}
		}
		return cells;
	}

	const visited = new Uint8Array(width * height);
	const cells: Cell[] = [];
	const stack: number[] = [seedX, seedY];
	visited[seedY * width + seedX] = 1;
	while (stack.length > 0) {
		const y = stack.pop()!;
		const x = stack.pop()!;
		cells.push([x, y]);
		const neighbours: ReadonlyArray<Cell> = [
			[x - 1, y],
			[x + 1, y],
			[x, y - 1],
			[x, y + 1],
		];
		for (const [nx, ny] of neighbours) {
			if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
				continue;
			}
			const vi = ny * width + nx;
			if (visited[vi] || !matches(nx, ny)) {
				continue;
			}
			visited[vi] = 1;
			stack.push(nx, ny);
		}
	}
	return cells;
};
