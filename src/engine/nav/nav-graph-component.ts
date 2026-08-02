import { buildNavGraph, type NavProfile } from "./nav-graph-builder";
import type { NavGraph } from "./nav-graph";
import type { NavSurface } from "./nav-surface";

type CachedGraph = {
	halfWidth: number;
	heightPx: number;
	jumpSpeed: number;
	moveSpeed: number;
	maxDropHeight: number;
	graph: NavGraph;
};

/**
 * The walkable surface of the current tilemap plus the nav graphs derived from
 * it, one per agent shape.
 *
 * Graphs are keyed by the profile fields the builder actually reads, matched by
 * value rather than by a composed string so a lookup on the hot path allocates
 * nothing. A world holds at most a handful of distinct agent shapes, so the
 * linear scan is shorter than hashing them would be.
 */
export class NavGraphComponent {
	version = 0;
	gravity = 640;
	surface: NavSurface | null = null;
	private readonly graphs: CachedGraph[] = [];

	reset(surface: NavSurface, version: number): void {
		this.surface = surface;
		this.version = version;
		this.graphs.length = 0;
	}

	graphFor(profile: NavProfile): NavGraph | null {
		if (!this.surface) {
			return null;
		}
		for (const cached of this.graphs) {
			if (
				cached.halfWidth === profile.halfWidth &&
				cached.heightPx === profile.heightPx &&
				cached.jumpSpeed === profile.jumpSpeed &&
				cached.moveSpeed === profile.moveSpeed &&
				cached.maxDropHeight === profile.maxDropHeight
			) {
				return cached.graph;
			}
		}
		const graph = buildNavGraph(this.surface, profile, this.version);
		this.graphs.push({
			halfWidth: profile.halfWidth,
			heightPx: profile.heightPx,
			jumpSpeed: profile.jumpSpeed,
			moveSpeed: profile.moveSpeed,
			maxDropHeight: profile.maxDropHeight,
			graph,
		});
		return graph;
	}
}
