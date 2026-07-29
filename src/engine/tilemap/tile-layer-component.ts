import { AssetRef } from "../asset-ref";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import { TileGrid } from "./grid";
import { applyRects, type TileRect, tileRects } from "./rects";

export type TileCollisionMode = "none" | "solid";

/**
 * How a tile layer treats falling rain, in inspector order.
 *
 * `"auto"` follows {@link TileLayerComponent.collision} — a solid layer keeps
 * rain out, a non-colliding one lets it through — which is the right answer for
 * almost every authored layer. The explicit modes exist for the two cases where
 * shelter and collision genuinely disagree: a canopy or awning the player walks
 * through but rain does not (`"blocks"`), and a solid catwalk or grating rain
 * falls straight through (`"passes"`).
 */
export const RAIN_BLOCKING_MODES = [
	"auto",
	"blocks",
	"passes",
] as const;

/** A member of {@link RAIN_BLOCKING_MODES}. */
export type RainBlockingMode = (typeof RAIN_BLOCKING_MODES)[number];

@serializable("TileLayer")
export class TileLayerComponent {
	@serialize() name = "layer";
	@serialize() tilesetRef = new AssetRef("image/*");
	@serialize({ options: ["none", "solid"] })
	collision: TileCollisionMode = "solid";
	@serialize({ options: RAIN_BLOCKING_MODES })
	rainBlocking: RainBlockingMode = "auto";
	@serialize() renderLayer = "terrain";
	@serialize() order = 0;

	readonly grid = new TileGrid();
	visible = true;

	@serialize() get cells(): TileRect[] {
		return tileRects(this.grid);
	}

	set cells(rects: ReadonlyArray<TileRect>) {
		applyRects(this.grid, rects);
	}
}
