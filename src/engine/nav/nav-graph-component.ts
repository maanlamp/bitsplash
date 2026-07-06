import { buildNavGraph, type NavProfile } from "./nav-graph-builder";
import type { NavGraph } from "./nav-graph";
import type { NavSurface } from "./nav-surface";

export class NavGraphComponent {
	version = 0;
	gravity = 640;
	surface: NavSurface | null = null;
	private graphs = new Map<string, NavGraph>();

	reset(surface: NavSurface, version: number): void {
		this.surface = surface;
		this.version = version;
		this.graphs.clear();
	}

	graphFor(profile: NavProfile): NavGraph | null {
		if (!this.surface) {
			return null;
		}
		const key = `${profile.halfWidth}:${profile.heightPx}:${profile.jumpSpeed}:${profile.moveSpeed}:${profile.maxDropHeight}`;
		let graph = this.graphs.get(key);
		if (!graph) {
			graph = buildNavGraph(this.surface, profile, this.version);
			this.graphs.set(key, graph);
		}
		return graph;
	}
}
