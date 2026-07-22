import type { SymmetryMode } from "./sprite-modifiers";

/** An integer image cell. */
export type Cell = readonly [number, number];

/**
 * Expand one painted cell into itself plus its mirror across the canvas centre,
 * so a stroke, shape or fill drawn on one side is reproduced on the other. The
 * axis is the image centre (v1): `horizontal` symmetry mirrors left↔right
 * (`x → width-1-x`), `vertical` mirrors top↔bottom (`y → height-1-y`), matching
 * Aseprite's naming where the symmetry *line* is perpendicular to the mirrored
 * axis.
 *
 * The original cell is always first; the mirror is omitted when it coincides
 * with the original (a pixel on the centre column/row of an odd dimension) so a
 * caller never writes the same cell twice.
 *
 * @example
 * mirrorCells("horizontal", 8, 8, 1, 3); // [[1,3],[6,3]]
 * mirrorCells("off", 8, 8, 1, 3);        // [[1,3]]
 */
export const mirrorCells = (
	symmetry: SymmetryMode,
	width: number,
	height: number,
	x: number,
	y: number,
): ReadonlyArray<Cell> => {
	if (symmetry === "horizontal") {
		const mx = width - 1 - x;
		return mx === x
			? [[x, y]]
			: [
					[x, y],
					[mx, y],
				];
	}
	if (symmetry === "vertical") {
		const my = height - 1 - y;
		return my === y
			? [[x, y]]
			: [
					[x, y],
					[x, my],
				];
	}
	return [[x, y]];
};
