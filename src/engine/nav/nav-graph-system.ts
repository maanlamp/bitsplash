import { profiler } from "../profiling/profiler";
import { type UpdateContext, UpdateSystem } from "../system";
import {
	mergedSolidCells,
	solidBounds,
	solidTileLayers,
	tileLayerSignature,
} from "../tilemap/occupancy";
import { NavAgentComponent } from "./nav-agent-component";
import { NavGraphComponent } from "./nav-graph-component";
import { NavSurface } from "./nav-surface";
import { resolveNavProfile } from "./nav-profile";
import { PhysicsBodyComponent } from "../physics/physics-body-component";
import type { ReadonlyECS } from "../ecs";

@profiler("Nav graph", "AI")
export class NavGraphSystem implements UpdateSystem {
	private signature: string | null = null;
	private version = 0;
	private pending = false;
	private readonly gravity: number;

	constructor(gravity = 640) {
		this.gravity = gravity;
	}

	update({ ecs }: UpdateContext): void {
		const signature = tileLayerSignature(solidTileLayers(ecs));

		let entry = ecs.queryFirst(NavGraphComponent);
		if (!entry) {
			const comp = new NavGraphComponent();
			comp.gravity = this.gravity;
			ecs.createEntity([comp]);
			entry = ecs.queryFirst(NavGraphComponent)!;
		}
		if (signature === this.signature && entry[1].surface) {
			if (this.pending) {
				this.pending = !this.buildForAgents(ecs, entry[1]);
			}
			return;
		}
		const firstSurface = this.signature === null;
		this.signature = signature;
		this.version += 1;
		entry[1].gravity = this.gravity;
		entry[1].reset(
			new NavSurface(mergedSolidCells(ecs), solidBounds(ecs)),
			this.version,
		);
		this.pending = firstSurface
			? !this.buildForAgents(ecs, entry[1])
			: true;
	}

	/**
	 * Build a graph for every agent shape present.
	 *
	 * Building is tens of milliseconds, and left to `graphFor`'s cache miss it
	 * lands inside whichever agent loop asks first — in play, an arbitrary
	 * mid-combat frame. Doing it here puts the scene's one build on a load frame
	 * instead. Agents are spawned by systems that run after this one, so a build
	 * that found none is not done: `update` keeps retrying until one lands, at
	 * the cost of an empty query per frame.
	 *
	 * Rebuilds after the first only happen when tiles are edited, which is the
	 * editor: those wait for the tile signature to settle, so a paint drag
	 * rebuilds once at the end of the stroke rather than once per cell.
	 *
	 * @returns whether any graph was built — false when no agent exists yet.
	 */
	private buildForAgents(
		ecs: ReadonlyECS,
		comp: NavGraphComponent,
	): boolean {
		let built = false;
		for (const [id, , rb] of ecs.query(
			NavAgentComponent,
			PhysicsBodyComponent,
		)) {
			const profile = resolveNavProfile(ecs, id, rb, comp.gravity);
			if (profile.jumpSpeed <= 0 && profile.moveSpeed <= 0) {
				continue;
			}
			comp.graphFor(profile);
			built = true;
		}
		return built;
	}
}
