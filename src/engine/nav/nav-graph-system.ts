import { profiler } from "../profiling/profiler";
import { type UpdateContext, UpdateSystem } from "../system";
import {
	mergedSolidCells,
	solidBounds,
	solidTileLayers,
} from "../tilemap/occupancy";
import { NavGraphComponent } from "./nav-graph-component";
import { NavSurface } from "./nav-surface";

@profiler("Nav graph", "AI")
export class NavGraphSystem implements UpdateSystem {
	private signature: string | null = null;
	private version = 0;
	private readonly gravity: number;

	constructor(gravity = 640) {
		this.gravity = gravity;
	}

	update({ ecs }: UpdateContext): void {
		const signature = solidTileLayers(ecs)
			.map(([id, layer]) => `${id}:${layer.grid.version}`)
			.join("|");

		let entry = ecs.query(NavGraphComponent)[0];
		if (!entry) {
			const comp = new NavGraphComponent();
			comp.gravity = this.gravity;
			ecs.createEntity([comp]);
			entry = ecs.query(NavGraphComponent)[0]!;
		}
		if (signature === this.signature && entry[1].surface) {
			return;
		}
		this.signature = signature;
		this.version += 1;
		entry[1].gravity = this.gravity;
		entry[1].reset(
			new NavSurface(mergedSolidCells(ecs), solidBounds(ecs)),
			this.version,
		);
	}
}
