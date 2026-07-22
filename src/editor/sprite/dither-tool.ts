import { ditherMask } from "./dither";
import { StrokeTool } from "./stroke-tool";
import type { CellFilter } from "./stamp";
import type { StrokeMode } from "./stroke-buffer";
import type { ToolContext } from "./tool-strategy";

/**
 * The dither brush: a freehand paint stroke whose dabs are masked by an ordered
 * (Bayer) dither at the editor's dither density, so painting lays a dithered
 * fill of the active colour rather than a solid coat. Shares every stroke
 * behaviour with the brush (sized/shaped dabs, stabilizer, pixel-perfect,
 * symmetry, pressure) — it only supplies a per-cell dither mask.
 *
 * The mask is keyed on document cell coordinates, so patterns from separate
 * strokes tile seamlessly.
 */
export class DitherTool extends StrokeTool {
	readonly id = "dither" as const;
	protected readonly mode: StrokeMode = "paint";

	protected override cellFilter(ctx: ToolContext): CellFilter {
		const density = ctx.state.ditherDensity / 100;
		return (x, y) => ditherMask(x, y, density);
	}
}
