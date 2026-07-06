import { Duration } from "../duration";
import type { EntityId } from "../ecs";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import { TILE_SIZE } from "../tilemap/tile";
import type Vector2 from "../vector2";
import type { NavPathStep } from "./astar";

export type NavAgentStatus =
	| "idle"
	| "moving"
	| "arrived"
	| "unreachable";

@serializable("NavAgent")
export class NavAgentComponent {
	@serialize({ group: "capability" }) jumpSpeed: number;
	@serialize({ group: "capability" }) moveSpeed: number;
	@serialize({ group: "capability" }) maxDropHeight: number;
	@serialize() arriveTolerance: number;
	@serialize() stuckTimeout: Duration;

	target: Vector2 | EntityId | null = null;
	path: ReadonlyArray<NavPathStep> = [];
	pathIndex: number = 0;
	status: NavAgentStatus = "idle";

	graphVersion: number = -1;
	goalNodeId: number = -1;
	progressDist: number = Infinity;
	stuckElapsed: number = 0;
	failures: number = 0;

	constructor(
		jumpSpeed: number = 0,
		moveSpeed: number = 0,
		maxDropHeight: number = 8 * TILE_SIZE,
		arriveTolerance: number = 4,
		stuckTimeout: number = 1.5,
	) {
		this.jumpSpeed = jumpSpeed;
		this.moveSpeed = moveSpeed;
		this.maxDropHeight = maxDropHeight;
		this.arriveTolerance = arriveTolerance;
		this.stuckTimeout = new Duration(stuckTimeout);
	}
}
