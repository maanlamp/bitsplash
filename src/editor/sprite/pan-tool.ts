import type { CursorValue } from "../../engine/cursor/cursor-authority";
import type { SpriteTool } from "./tool-strategy";

/**
 * The hand/pan tool. It has no pointer lifecycle and no preview: the actual
 * camera drag is performed by `SpriteCameraSystem`, which reads the engine input
 * snapshot and pans while the active tool id is `pan` (or the middle button is
 * held). This strategy exists only to own the tool identity and cursor.
 */
export class PanTool implements SpriteTool {
	readonly id = "pan" as const;

	cursor(): CursorValue {
		return "grab";
	}
}
