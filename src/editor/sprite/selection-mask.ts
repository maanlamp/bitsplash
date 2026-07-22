import { computeFill } from "./flood-fill";
import type { PixelBuffer } from "./pixel-buffer";

/**
 * A per-pixel boolean selection over the canvas: one byte per cell (`0`
 * unselected, `1` selected), row-major, canvas-sized. A `Uint8Array` rather than
 * a `boolean[]` so the whole-canvas boolean operations (build, combine,
 * translate) stay a single tight loop and the buffer is cheap to clone for undo.
 *
 * Masks are values: builders and {@link combineMask} return fresh masks and
 * never mutate their inputs, so a tool can keep a base mask and derive the
 * displayed mask from it each pointer move without copying defensively.
 */
export type SelectionMask = Readonly<{
	width: number;
	height: number;
	data: Uint8Array;
}>;

/** How a freshly built region combines with the current selection. */
export type SelectionOp =
	| "replace"
	| "add"
	| "subtract"
	| "intersect";

/**
 * The conventional pixel-editor modifier mapping: Shift adds to the selection,
 * Alt subtracts, both together intersect, neither replaces.
 */
export const selectionOp = (
	shift: boolean,
	alt: boolean,
): SelectionOp =>
	shift && alt
		? "intersect"
		: shift
			? "add"
			: alt
				? "subtract"
				: "replace";

/** Allocate an empty (nothing selected) mask of the given size. */
export const createMask = (
	width: number,
	height: number,
): SelectionMask => ({
	width,
	height,
	data: new Uint8Array(width * height),
});

/** A deep copy, so the clone can be stored on the undo stack independently. */
export const cloneMask = (mask: SelectionMask): SelectionMask => ({
	width: mask.width,
	height: mask.height,
	data: new Uint8Array(mask.data),
});

/** Whether cell `(x, y)` is selected. Out-of-bounds reads as unselected. */
export const maskContains = (
	mask: SelectionMask,
	x: number,
	y: number,
): boolean => {
	if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) {
		return false;
	}
	return mask.data[y * mask.width + x] === 1;
};

/** Whether no cell is selected. */
export const maskIsEmpty = (mask: SelectionMask): boolean => {
	for (let i = 0; i < mask.data.length; i++) {
		if (mask.data[i] !== 0) {
			return false;
		}
	}
	return true;
};

/** Inclusive bounding box of the selected cells, or `null` when empty. */
export const maskBounds = (
	mask: SelectionMask,
): Readonly<{
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}> | null => {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	const { width, height, data } = mask;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (data[y * width + x] === 1) {
				if (x < x0) {
					x0 = x;
				}
				if (y < y0) {
					y0 = y;
				}
				if (x > x1) {
					x1 = x;
				}
				if (y > y1) {
					y1 = y;
				}
			}
		}
	}
	return x1 < x0 ? null : { x0, y0, x1, y1 };
};

/**
 * A rectangular region mask spanning the inclusive box between two cells (in
 * either order), clipped to the canvas.
 */
export const rectMask = (
	width: number,
	height: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): SelectionMask => {
	const mask = createMask(width, height);
	const x0 = Math.max(0, Math.min(ax, bx));
	const y0 = Math.max(0, Math.min(ay, by));
	const x1 = Math.min(width - 1, Math.max(ax, bx));
	const y1 = Math.min(height - 1, Math.max(ay, by));
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			mask.data[y * width + x] = 1;
		}
	}
	return mask;
};

const markLine = (
	mask: SelectionMask,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): void => {
	let x = x0;
	let y = y0;
	const dx = Math.abs(x1 - x0);
	const dy = Math.abs(y1 - y0);
	const sx = x0 < x1 ? 1 : -1;
	const sy = y0 < y1 ? 1 : -1;
	let err = dx - dy;
	for (;;) {
		if (x >= 0 && y >= 0 && x < mask.width && y < mask.height) {
			mask.data[y * mask.width + x] = 1;
		}
		if (x === x1 && y === y1) {
			break;
		}
		const e2 = 2 * err;
		if (e2 > -dy) {
			err -= dy;
			x += sx;
		}
		if (e2 < dx) {
			err += dx;
			y += sy;
		}
	}
};

/**
 * A filled polygon mask from a freehand lasso path (cell coordinates). The
 * outline is rasterised (so a thin lasso still selects its trace) and the
 * interior is filled by an even-odd test on each cell centre against the closed
 * polygon. An empty or single-point path yields an empty mask.
 */
export const lassoMask = (
	width: number,
	height: number,
	points: ReadonlyArray<readonly [number, number]>,
): SelectionMask => {
	const mask = createMask(width, height);
	if (points.length < 2) {
		return mask;
	}
	for (let i = 0; i < points.length; i++) {
		const [ax, ay] = points[i]!;
		const [bx, by] = points[(i + 1) % points.length]!;
		markLine(mask, ax, ay, bx, by);
	}
	for (let y = 0; y < height; y++) {
		const cy = y + 0.5;
		for (let x = 0; x < width; x++) {
			if (mask.data[y * width + x] === 1) {
				continue;
			}
			if (pointInPolygon(points, x + 0.5, cy)) {
				mask.data[y * width + x] = 1;
			}
		}
	}
	return mask;
};

const pointInPolygon = (
	points: ReadonlyArray<readonly [number, number]>,
	px: number,
	py: number,
): boolean => {
	let inside = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const [xi, yi] = points[i]!;
		const [xj, yj] = points[j]!;
		const cyi = yi + 0.5;
		const cyj = yj + 0.5;
		const cxi = xi + 0.5;
		const cxj = xj + 0.5;
		if (
			cyi > py !== cyj > py &&
			px < ((cxj - cxi) * (py - cyi)) / (cyj - cyi) + cxi
		) {
			inside = !inside;
		}
	}
	return inside;
};

/**
 * A magic-wand region mask: the cells a bucket fill would cover on `pixels`
 * from the seed, by colour similarity within `tolerance` (contiguous or global).
 * Reuses the {@link computeFill} flood logic so the wand and the fill tool agree
 * cell-for-cell.
 */
export const wandMask = (
	pixels: PixelBuffer,
	seedX: number,
	seedY: number,
	tolerance: number,
	contiguous: boolean,
): SelectionMask => {
	const mask = createMask(pixels.width, pixels.height);
	for (const [x, y] of computeFill(
		pixels,
		seedX,
		seedY,
		tolerance,
		contiguous,
	)) {
		mask.data[y * pixels.width + x] = 1;
	}
	return mask;
};

/**
 * Combine a freshly built region into a base selection under a boolean op,
 * returning a new mask. `replace` discards the base; `add` unions; `subtract`
 * removes the region from the base; `intersect` keeps only their overlap. The
 * two masks must share dimensions.
 */
export const combineMask = (
	base: SelectionMask,
	region: SelectionMask,
	op: SelectionOp,
): SelectionMask => {
	if (op === "replace") {
		return cloneMask(region);
	}
	const out = createMask(base.width, base.height);
	for (let i = 0; i < out.data.length; i++) {
		const b = base.data[i] === 1;
		const r = region.data[i] === 1;
		out.data[i] = (
			op === "add" ? b || r : op === "subtract" ? b && !r : b && r
		)
			? 1
			: 0;
	}
	return out;
};

/**
 * A left-to-right mirror of the mask (same dimensions); column `x` maps to
 * `width-1-x`. Applied twice it is the identity. The mask counterpart of
 * {@link import("./image-transform").flipHorizontal}, used to keep a floating
 * selection's footprint aligned with its flipped pixels.
 */
export const flipMaskHorizontal = (
	mask: SelectionMask,
): SelectionMask => {
	const { width, height, data } = mask;
	const out = createMask(width, height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			out.data[y * width + (width - 1 - x)] = data[y * width + x]!;
		}
	}
	return out;
};

/** A top-to-bottom mirror of the mask (same dimensions); its own inverse. */
export const flipMaskVertical = (
	mask: SelectionMask,
): SelectionMask => {
	const { width, height, data } = mask;
	const out = createMask(width, height);
	for (let y = 0; y < height; y++) {
		out.data.set(
			data.subarray(y * width, y * width + width),
			(height - 1 - y) * width,
		);
	}
	return out;
};

/**
 * The mask rotated 90° **clockwise**, with `width`↔`height` swapped. The mask
 * counterpart of {@link import("./image-transform").rotateCw}, applying the same
 * cell mapping so a rotated float's footprint tracks its rotated pixels.
 */
export const rotateMaskCw = (mask: SelectionMask): SelectionMask => {
	const { width, height, data } = mask;
	const out = createMask(height, width);
	const nw = height;
	const nh = width;
	for (let ny = 0; ny < nh; ny++) {
		for (let nx = 0; nx < nw; nx++) {
			const ox = ny;
			const oy = height - 1 - nx;
			out.data[ny * nw + nx] = data[oy * width + ox]!;
		}
	}
	return out;
};

/** The mask rotated 90° **counter-clockwise**; the exact inverse of {@link rotateMaskCw}. */
export const rotateMaskCcw = (mask: SelectionMask): SelectionMask => {
	const { width, height, data } = mask;
	const out = createMask(height, width);
	const nw = height;
	const nh = width;
	for (let ny = 0; ny < nh; ny++) {
		for (let nx = 0; nx < nw; nx++) {
			const ox = width - 1 - ny;
			const oy = nx;
			out.data[ny * nw + nx] = data[oy * width + ox]!;
		}
	}
	return out;
};

/**
 * The mask rotated by an **arbitrary** angle into a fresh `outW`×`outH` mask,
 * pivoting about both masks' centres, sampled nearest (a cell is selected when
 * the source cell its centre maps back to was selected). Angle is
 * clockwise-positive in screen space, matching
 * {@link import("./rotsprite").rotsprite} — used to keep a RotSprite-rotated
 * float's footprint aligned with its rotated pixels. At the cardinal angles it
 * agrees cell-for-cell with {@link rotateMaskCw}/{@link rotateMaskCcw}.
 */
export const rotateMaskNearest = (
	mask: SelectionMask,
	angleRadians: number,
	outW: number,
	outH: number,
): SelectionMask => {
	const out = createMask(outW, outH);
	const cos = Math.cos(angleRadians);
	const sin = Math.sin(angleRadians);
	const ocx = outW / 2;
	const ocy = outH / 2;
	const scx = mask.width / 2;
	const scy = mask.height / 2;
	for (let oy = 0; oy < outH; oy++) {
		for (let ox = 0; ox < outW; ox++) {
			const dx = ox + 0.5 - ocx;
			const dy = oy + 0.5 - ocy;
			const sx = Math.floor(cos * dx + sin * dy + scx);
			const sy = Math.floor(-sin * dx + cos * dy + scy);
			if (
				sx >= 0 &&
				sy >= 0 &&
				sx < mask.width &&
				sy < mask.height &&
				mask.data[sy * mask.width + sx] === 1
			) {
				out.data[oy * outW + ox] = 1;
			}
		}
	}
	return out;
};

/** A copy of the mask shifted by `(dx, dy)`, dropping cells that fall off. */
export const translateMask = (
	mask: SelectionMask,
	dx: number,
	dy: number,
): SelectionMask => {
	const out = createMask(mask.width, mask.height);
	const { width, height, data } = mask;
	for (let y = 0; y < height; y++) {
		const ny = y + dy;
		if (ny < 0 || ny >= height) {
			continue;
		}
		for (let x = 0; x < width; x++) {
			if (data[y * width + x] !== 1) {
				continue;
			}
			const nx = x + dx;
			if (nx < 0 || nx >= width) {
				continue;
			}
			out.data[ny * width + nx] = 1;
		}
	}
	return out;
};
