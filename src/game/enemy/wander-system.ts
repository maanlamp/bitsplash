import { StateMachineComponent } from "../../engine/fsm/state-machine-component";
import { NavAgentComponent } from "../../engine/nav/nav-agent-component";
import { NavGraphComponent } from "../../engine/nav/nav-graph-component";
import { NavGraph, nodeFeet } from "../../engine/nav/nav-graph";
import { resolveNavProfile } from "../../engine/nav/nav-profile";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import { TransformComponent } from "../../engine/transform-component";
import Vector2 from "../../engine/vector2";
import { WanderComponent } from "./wander-component";

export class WanderSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		const comp = ecs.query(NavGraphComponent)[0]?.[1];
		if (!comp?.surface) {
			return;
		}
		const s = dt / 1000;
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
			const sm = ecs.getComponent(id, StateMachineComponent);
			if (sm && sm.current && sm.current !== "patrol") {
				continue;
			}
			if (agent.status === "moving") {
				continue;
			}
			// idle / arrived / unreachable: pause in place, then re-pick
			wander.elapsed += s;
			if (wander.elapsed < wander.nextAt) {
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

	private pick(
		graph: NavGraph,
		wander: WanderComponent,
	): Vector2 | null {
		const origin = wander.origin!;
		const radius = wander.radiusTiles * TILE_SIZE;
		const candidates: Vector2[] = [];
		for (const node of graph.nodes) {
			const feet = nodeFeet(node);
			if (feet.distanceTo(origin) <= radius) {
				candidates.push(feet);
			}
		}
		if (candidates.length === 0) {
			return null;
		}
		const index = Math.floor(Math.random() * candidates.length);
		return candidates[index]!;
	}

	private reschedule(wander: WanderComponent): void {
		const min = wander.minInterval.seconds;
		const max = wander.maxInterval.seconds;
		wander.elapsed = 0;
		wander.nextAt = min + Math.random() * Math.max(0, max - min);
	}
}
