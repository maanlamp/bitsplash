import type { GridBounds } from "../tilemap/grid";

export type SupportKind = "none" | "solid";

export class NavSurface {
	private readonly cells: ReadonlySet<string>;
	private readonly boundsValue: GridBounds | null;

	constructor(cells: ReadonlySet<string>, bounds: GridBounds | null) {
		this.cells = cells;
		this.boundsValue = bounds;
	}

	supportAt(gx: number, gy: number): SupportKind {
		return this.cells.has(`${gx},${gy}`) ? "solid" : "none";
	}

	blocksAt(gx: number, gy: number): boolean {
		return this.cells.has(`${gx},${gy}`);
	}

	bounds(): GridBounds | null {
		return this.boundsValue;
	}
}
