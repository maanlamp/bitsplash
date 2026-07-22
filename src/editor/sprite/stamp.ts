import { dabOffsets } from "./brush-dab";
import { effectiveBrushSize } from "./brush-dynamics";
import type { StrokeMode } from "./stroke-buffer";
import type { ToolContext } from "./tool-strategy";

/**
 * A per-cell predicate deciding whether a footprint cell is written. `null`
 * (the common case) writes every cell; the dither brush passes an ordered-dither
 * mask so only the patterned cells land, while ink and symmetry still fold in per
 * written cell.
 */
export type CellFilter = ((x: number, y: number) => boolean) | null;

/**
 * Stamp one brush dab centred on cell `(cx, cy)` through the tool context's
 * paint/erase sink, expanding the active brush size and shape into its footprint
 * cells. The footprint diameter honours pressure→size dynamics
 * ({@link effectiveBrushSize}); each footprint cell goes through
 * {@link ToolContext.paint}/`erase`, so the active ink and symmetry still fold in
 * per cell — the dab decides *which* cells, the sink decides *how* each is
 * written. An optional {@link CellFilter} can veto individual cells (the dither
 * brush).
 *
 * Used by every cell-placing tool that respects brush size (brush, eraser, the
 * dither brush, and the line/rectangle/ellipse shapes for their stroke
 * thickness); the fill tool writes exact region cells and does not stamp dabs.
 */
export const stampDab = (
	ctx: ToolContext,
	cx: number,
	cy: number,
	mode: StrokeMode,
	filter: CellFilter = null,
): void => {
	const offsets = dabOffsets(
		ctx.state.brushShape,
		effectiveBrushSize(ctx.state, ctx.pressure),
	);
	for (const [dx, dy] of offsets) {
		const x = cx + dx;
		const y = cy + dy;
		if (filter && !filter(x, y)) {
			continue;
		}
		if (mode === "paint") {
			ctx.paint(x, y);
		} else {
			ctx.erase(x, y);
		}
	}
};
