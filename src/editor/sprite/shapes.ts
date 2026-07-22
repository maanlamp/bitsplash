import { bresenham } from "../line";

/** An integer image cell. */
export type Cell = readonly [number, number];

const key = (x: number, y: number): string => `${x},${y}`;

/** The cells of a straight line between two endpoints (inclusive). */
export const lineCells = (
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): ReadonlyArray<Cell> => {
	const cells: Cell[] = [];
	bresenham(x0, y0, x1, y1, (x, y) => cells.push([x, y]));
	return cells;
};

/**
 * The cells of an axis-aligned rectangle spanned by two opposite corners. With
 * `fill`, every enclosed cell; otherwise the one-pixel border only.
 */
export const rectCells = (
	ax: number,
	ay: number,
	bx: number,
	by: number,
	fill: boolean,
): ReadonlyArray<Cell> => {
	const x0 = Math.min(ax, bx);
	const x1 = Math.max(ax, bx);
	const y0 = Math.min(ay, by);
	const y1 = Math.max(ay, by);
	const cells: Cell[] = [];
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			const edge = x === x0 || x === x1 || y === y0 || y === y1;
			if (fill || edge) {
				cells.push([x, y]);
			}
		}
	}
	return cells;
};

/**
 * The cells of an ellipse inscribed in the bounding box spanned by two opposite
 * corners, via Zingl's integer midpoint rasteriser (correct for both odd and
 * even extents). With `fill`, the interior is scanline-filled from the outline's
 * per-row extents; otherwise the one-pixel outline only.
 */
export const ellipseCells = (
	ax: number,
	ay: number,
	bx: number,
	by: number,
	fill: boolean,
): ReadonlyArray<Cell> => {
	let x0 = Math.min(ax, bx);
	let x1 = Math.max(ax, bx);
	const y0 = Math.min(ay, by);
	const y1 = Math.max(ay, by);

	const outline: Cell[] = [];
	const plot = (x: number, y: number): void => {
		outline.push([x, y]);
	};

	let a = x1 - x0;
	const bDiam = y1 - y0;
	let b1 = bDiam & 1;
	let dx = 4 * (1 - a) * bDiam * bDiam;
	let dy = 4 * (b1 + 1) * a * a;
	let err = dx + dy + b1 * a * a;
	let yTop = y0 + ((bDiam + 1) >> 1);
	let yBot = yTop - b1;
	a = 8 * a * a;
	b1 = 8 * bDiam * bDiam;

	do {
		plot(x1, yTop);
		plot(x0, yTop);
		plot(x0, yBot);
		plot(x1, yBot);
		const e2 = 2 * err;
		if (e2 <= dy) {
			yTop++;
			yBot--;
			err += dy += a;
		}
		if (e2 >= dx || 2 * err > dy) {
			x0++;
			x1--;
			err += dx += b1;
		}
	} while (x0 <= x1);

	while (yTop - yBot < bDiam) {
		plot(x0 - 1, yTop);
		plot(x1 + 1, yTop++);
		plot(x0 - 1, yBot);
		plot(x1 + 1, yBot--);
	}

	if (!fill) {
		const seen = new Set<string>();
		const cells: Cell[] = [];
		for (const [x, y] of outline) {
			const k = key(x, y);
			if (!seen.has(k)) {
				seen.add(k);
				cells.push([x, y]);
			}
		}
		return cells;
	}

	const extents = new Map<number, { min: number; max: number }>();
	for (const [x, y] of outline) {
		const row = extents.get(y);
		if (!row) {
			extents.set(y, { min: x, max: x });
		} else {
			row.min = Math.min(row.min, x);
			row.max = Math.max(row.max, x);
		}
	}
	const cells: Cell[] = [];
	for (const [y, { min, max }] of extents) {
		for (let x = min; x <= max; x++) {
			cells.push([x, y]);
		}
	}
	return cells;
};
