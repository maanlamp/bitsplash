import type { Seconds } from "../../engine/duration";
import { NavAgentComponent } from "../../engine/nav/nav-agent-component";
import { NavGraphComponent } from "../../engine/nav/nav-graph-component";
import { NavGraph, nodeFeetInto } from "../../engine/nav/nav-graph";
import { resolveNavProfile } from "../../engine/nav/nav-profile";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { profiler } from "../../engine/profiling/profiler";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import { TransformComponent } from "../../engine/transform-component";
import Vector2 from "../../engine/vector2";
import { EnemyBrainComponent } from "./enemy-brain-component";
import { WanderComponent } from "./wander-component";

/** Wander runs on milliseconds `dt`, converted once per frame. */
@profiler("Wander", "AI")
export class WanderSystem implements UpdateSystem {
	private readonly feet = new Vector2();

	update({ dt, ecs }: UpdateContext): void {
		const comp = ecs.queryFirst(NavGraphComponent)?.[1];
		if (!comp?.surface) {
			return;
		}
		const dtSeconds = (dt / 1000) as Seconds;
		for (const [id, wander, agent, transform, rb] of ecs.query(
			WanderComponent,
			NavAgentComponent,
			TransformComponent,
			PhysicsBodyComponent,
		)) {
			if (!rb.body) {
				continue;
			}
			if (!wander.origin) {
				wander.origin = transform.position.clone();
			}
			const brain = ecs.getComponent(id, EnemyBrainComponent);
			if (brain && brain.machine.current !== "patrol") {
				continue;
			}
			if (agent.status === "moving") {
				continue;
			}
			// idle / arrived / unreachable: pause in place, then re-pick
			wander.dwell.tick(dtSeconds);
			if (!wander.dwell.done()) {
				continue;
			}
			const graph = comp.graphFor(
				resolveNavProfile(ecs, id, rb, comp.gravity),
			);
			if (graph) {
				const target = this.pick(graph, wander);
				if (target) {
					agent.target = target;
				}
			}
			this.reschedule(wander);
		}
	}

	/**
	 * A random node within the wander radius, found by counting the nodes in
	 * range and then walking to the nth — two passes so nothing is collected
	 * into a temporary array.
	 */
	private pick(
		graph: NavGraph,
		wander: WanderComponent,
	): Vector2 | null {
		const origin = wander.origin!;
		const radius = wander.radiusTiles * TILE_SIZE;
		const nodes = graph.nodes;
		let count = 0;
		for (let i = 0; i < nodes.length; i++) {
			nodeFeetInto(nodes[i]!, this.feet);
			if (this.feet.distanceTo(origin) <= radius) {
				count++;
			}
		}
		if (count === 0) {
			return null;
		}
		let wanted = Math.floor(Math.random() * count);
		for (let i = 0; i < nodes.length; i++) {
			nodeFeetInto(nodes[i]!, this.feet);
			if (this.feet.distanceTo(origin) > radius) {
				continue;
			}
			if (wanted === 0) {
				return this.feet.clone();
			}
			wanted--;
		}
		return null;
	}

	private reschedule(wander: WanderComponent): void {
		const min = wander.minInterval.seconds;
		const max = wander.maxInterval.seconds;
		wander.dwell.restart(
			min + Math.random() * Math.max(0, max - min),
		);
	}
}
