import { AssetRef } from "../asset-ref";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import { TileGrid } from "./grid";
import { applyRects, type TileRect, tileRects } from "./rects";

export type TileCollisionMode = "none" | "solid";

@serializable("TileLayer")
export class TileLayerComponent {
	@serialize() name = "layer";
	@serialize() tilesetRef = new AssetRef("image/*");
	@serialize({ options: ["none", "solid"] })
	collision: TileCollisionMode = "solid";
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
