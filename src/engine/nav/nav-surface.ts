import { type GridBounds, tileCellKey } from "../tilemap/grid";

export type SupportKind = "none" | "solid";

export class NavSurface {
	private readonly cells: ReadonlySet<number>;
	private readonly boundsValue: GridBounds | null;

	constructor(cells: ReadonlySet<number>, bounds: GridBounds | null) {
		this.cells = cells;
		this.boundsValue = bounds;
	}

	supportAt(gx: number, gy: number): SupportKind {
		return this.cells.has(tileCellKey(gx, gy)) ? "solid" : "none";
	}

	blocksAt(gx: number, gy: number): boolean {
		return this.cells.has(tileCellKey(gx, gy));
	}

	bounds(): GridBounds | null {
		return this.boundsValue;
	}
}
