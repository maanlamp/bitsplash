/**
 * Pure layout/range math for the timeline UI — no DOM, no React — so the tag-bar
 * and frame-column geometry the timeline relies on is unit-testable headlessly.
 */

/** Which edge of a tag bar a drag is resizing. */
export type TagEdge = "from" | "to";

/**
 * The column footprint of a tag over the frame axis: a tag spanning inclusive
 * frames `[from, to]` starts at column `from` and covers `to - from + 1`
 * columns. Multiply by the column width for pixel geometry.
 */
export const tagBarSpan = (
	from: number,
	to: number,
): Readonly<{ startColumn: number; columnSpan: number }> => ({
	startColumn: from,
	columnSpan: to - from + 1,
});

/**
 * Map a horizontal offset (px, relative to the frame track's left edge) to a
 * frame column index, clamped to `[0, frameCount - 1]`. Returns 0 for a
 * degenerate track (`columnWidth <= 0` or `frameCount <= 0`).
 */
export const frameColumnAt = (
	offsetX: number,
	columnWidth: number,
	frameCount: number,
): number => {
	if (columnWidth <= 0 || frameCount <= 0) {
		return 0;
	}
	const raw = Math.floor(offsetX / columnWidth);
	return Math.max(0, Math.min(frameCount - 1, raw));
};

/**
 * Resize one edge of a tag's inclusive `[from, to]` range to `target`, keeping
 * the result in bounds (`0..frameCount - 1`) and non-inverted. Dragging the
 * `from` edge past `to` (or vice versa) collapses the range to a single frame at
 * the anchored edge rather than inverting it.
 */
export const resizeTagRange = (
	from: number,
	to: number,
	edge: TagEdge,
	target: number,
	frameCount: number,
): Readonly<{ from: number; to: number }> => {
	const clamped = Math.max(0, Math.min(frameCount - 1, target));
	if (edge === "from") {
		return { from: Math.min(clamped, to), to };
	}
	return { from, to: Math.max(clamped, from) };
};
