import type { History } from "../history";
import { blankPixels } from "./pixel-buffer";
import { type Rgba, replaceColor } from "./replace-color";
import type { SpriteEditCore } from "./sprite-edit-core";
import { recordStroke } from "./stroke";

/**
 * Replace colour `from` with colour `to` across the **active cel** (active
 * layer, active frame) as one undoable edit, routed through the same
 * cel-scoped pixel-command path a brush stroke uses ({@link recordStroke}), so
 * it takes exactly one history entry and a no-op replace records nothing.
 *
 * Scoped to the active cel (not the whole document) — the conventional default,
 * and what keeps the edit a single cel-scoped undo entry. `tolerance` matches
 * the bucket fill's semantics (Chebyshev RGBA distance; `0` = exact).
 *
 * @example
 * // Recolour every exact-red pixel of the active cel to the active colour.
 * replaceActiveCelColor(core, history, [255, 0, 0, 255], [0, 0, 255, 255]);
 */
export const replaceActiveCelColor = (
	core: SpriteEditCore,
	history: History,
	from: Rgba,
	to: Rgba,
	tolerance = 0,
): void => {
	const layerId = core.activeLayerId;
	const frame = core.activeFrameIndex;
	const cel =
		core.getCel(layerId, frame) ??
		blankPixels(core.width, core.height);
	const before = core.snapshot();
	core.setCel(layerId, frame, replaceColor(cel, from, to, tolerance));
	recordStroke(core, history, before);
};
