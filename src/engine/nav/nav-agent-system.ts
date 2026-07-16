import type { ECS } from "../ecs";
import { MovementIntentComponent } from "../locomotion/movement-intent-component";
import { computeGrounded } from "../physics/grounded";
import { PhysicsBodyComponent } from "../physics/physics-body-component";
import { profiler } from "../profiling/profiler";
import { type UpdateContext, UpdateSystem } from "../system";
import { TILE_SIZE } from "../tilemap/tile";
import { TransformComponent } from "../transform-component";
import Vector2 from "../vector2";
import { findPath } from "./astar";
import { NavGraph, type NavNode, nodeFeet } from "./nav-graph";
import { NavAgentComponent } from "./nav-agent-component";
import { NavGraphComponent } from "./nav-graph-component";
import { resolveNavProfile } from "./nav-profile";

const MAX_FAILURES = 3;
const REACH_X = TILE_SIZE * 0.75;
const REACH_Y = TILE_SIZE * 0.75;

@profiler("Nav agent", "AI")
export class NavAgentSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		const comp = ecs.query(NavGraphComponent)[0]?.[1];
		if (!comp?.surface) {
			return;
		}
		const s = dt / 1000;
		for (const [id, agent, intent, transform, rb] of ecs.query(
			NavAgentComponent,
			MovementIntentComponent,
			TransformComponent,
			PhysicsBodyComponent,
		)) {
			if (!rb.body) {
				continue;
			}
			const profile = resolveNavProfile(ecs, id, rb, comp.gravity);
			if (profile.jumpSpeed <= 0 && profile.moveSpeed <= 0) {
				continue;
			}
			const graph = comp.graphFor(profile);
			if (!graph) {
				continue;
			}
			this.drive(
				ecs,
				agent,
				intent,
				transform,
				rb,
				graph,
				comp.version,
				s,
			);
		}
	}

	private drive(
		ecs: ECS,
		agent: NavAgentComponent,
		intent: MovementIntentComponent,
		transform: TransformComponent,
		rb: PhysicsBodyComponent,
		graph: NavGraph,
		graphVersion: number,
		s: number,
	): void {
		const targetPos = this.resolveTarget(ecs, agent, transform);
		if (!targetPos) {
			this.setInert(agent, intent, "idle");
			return;
		}

		const half = rb.body!.halfExtents;
		const bodyPos = rb.body!.position;
		const feet = new Vector2(bodyPos.x, bodyPos.y + half.y);
		const grounded = computeGrounded(rb.body!);
		const goalNode = graph.nearestNode(
			targetPos,
			agent.maxDropHeight,
		);

		let stuck = false;
		if (agent.status === "moving" && agent.path.length > 0) {
			if (grounded) {
				const marker =
					agent.pathIndex < agent.path.length
						? nodeFeet(agent.path[agent.pathIndex]!.node)
						: targetPos;
				const dist = feet.distanceTo(marker);
				if (dist < agent.progressDist - 1) {
					agent.progressDist = dist;
					agent.stuckElapsed = 0;
				} else {
					agent.stuckElapsed += s;
				}
				stuck = agent.stuckElapsed >= agent.stuckTimeout.seconds;
			}
		}

		if (agent.status === "unreachable") {
			if (goalNode && goalNode.id !== agent.goalNodeId) {
				agent.failures = 0;
			} else {
				return;
			}
		}

		if (stuck) {
			agent.failures += 1;
			if (agent.failures >= MAX_FAILURES) {
				this.setInert(agent, intent, "unreachable");
				if (goalNode) {
					agent.goalNodeId = goalNode.id;
				}
				return;
			}
		}

		const needPlan =
			agent.path.length === 0 ||
			agent.status === "idle" ||
			agent.graphVersion !== graphVersion ||
			(goalNode !== null && goalNode.id !== agent.goalNodeId) ||
			stuck;

		if (needPlan) {
			this.plan(agent, intent, graph, feet, goalNode, graphVersion);
			if (agent.status !== "moving") {
				return;
			}
		}

		this.execute(agent, intent, feet, grounded, targetPos);
	}

	private plan(
		agent: NavAgentComponent,
		intent: MovementIntentComponent,
		graph: NavGraph,
		feet: Vector2,
		goalNode: NavNode | null,
		graphVersion: number,
	): void {
		const startNode = graph.nearestNode(feet, agent.maxDropHeight);
		const path =
			startNode && goalNode
				? findPath(graph, startNode, goalNode)
				: null;
		if (!path || !goalNode) {
			agent.failures += 1;
			agent.path = [];
			if (agent.failures >= MAX_FAILURES) {
				this.setInert(agent, intent, "unreachable");
				if (goalNode) {
					agent.goalNodeId = goalNode.id;
				}
			}
			return;
		}
		agent.path = path;
		agent.pathIndex = 1;
		agent.goalNodeId = goalNode.id;
		agent.graphVersion = graphVersion;
		agent.progressDist = Infinity;
		agent.stuckElapsed = 0;
		agent.status = "moving";
	}

	private execute(
		agent: NavAgentComponent,
		intent: MovementIntentComponent,
		feet: Vector2,
		grounded: boolean,
		targetPos: Vector2,
	): void {
		intent.moveX = 0;
		intent.jumpPressed = false;
		intent.jumpHeld = false;
		intent.jumpSpeed = null;
		const tol = agent.arriveTolerance;

		if (agent.pathIndex >= agent.path.length) {
			const dx = targetPos.x - feet.x;
			if (grounded && Math.abs(dx) <= tol) {
				this.setInert(agent, intent, "arrived");
			} else if (grounded) {
				intent.moveX = Math.sign(dx);
			}
			return;
		}

		const step = agent.path[agent.pathIndex]!;
		const node = step.node;
		if (this.reachedNode(feet, node, grounded)) {
			this.advance(agent);
			return;
		}

		const tf = nodeFeet(node);
		const dx = tf.x - feet.x;
		const kind = step.edge?.kind ?? "walk";

		if (kind === "walk") {
			intent.moveX = Math.abs(dx) <= tol ? 0 : Math.sign(dx);
			return;
		}

		if (kind === "fall") {
			intent.moveX = grounded
				? Math.sign(dx) || 1
				: Math.abs(dx) <= tol
					? 0
					: Math.sign(dx);
			return;
		}

		const launchNode = agent.path[agent.pathIndex - 1]!.node;
		const launchX = nodeFeet(launchNode).x;
		const launchVy = step.edge?.launchVy ?? 0;
		const toward = Math.sign(dx) || 1;
		const targetHigher = node.gy < launchNode.gy;

		if (grounded) {
			const rel = (feet.x - launchX) * toward;
			if (!targetHigher && rel < -tol) {
				intent.moveX = toward;
			} else {
				intent.jumpPressed = true;
				intent.jumpSpeed = launchVy;
				intent.moveX = targetHigher ? 0 : toward;
			}
		} else if (targetHigher && feet.y > tf.y + REACH_Y) {
			intent.moveX = 0;
		} else {
			intent.moveX = toward;
		}
	}

	private reachedNode(
		feet: Vector2,
		node: NavNode,
		grounded: boolean,
	): boolean {
		const center = (node.gx + 0.5) * TILE_SIZE;
		const feetY = (node.gy + 1) * TILE_SIZE;
		return (
			grounded &&
			Math.abs(feet.x - center) <= REACH_X &&
			Math.abs(feet.y - feetY) <= REACH_Y
		);
	}

	private advance(agent: NavAgentComponent): void {
		agent.pathIndex += 1;
		agent.failures = 0;
		agent.progressDist = Infinity;
		agent.stuckElapsed = 0;
	}

	private setInert(
		agent: NavAgentComponent,
		intent: MovementIntentComponent,
		status: NavAgentComponent["status"],
	): void {
		if (agent.status !== status) {
			agent.status = status;
			agent.path = [];
			intent.clear();
		}
	}

	private resolveTarget(
		ecs: ECS,
		agent: NavAgentComponent,
		self: TransformComponent,
	): Vector2 | null {
		const t = agent.target;
		if (t === null) {
			return null;
		}
		if (typeof t === "string") {
			const tr = ecs.getComponent(t, TransformComponent);
			return tr && tr !== self ? tr.position : null;
		}
		return t;
	}
}
