import type { EntityId } from "../../engine/ecs";
import { EntityRef } from "../../engine/entity-ref";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import { TILE_SIZE } from "../../engine/tilemap/tile";

@serializable("Follow")
export class FollowComponent {
	@serialize() leaderRef: EntityRef = new EntityRef(null);
	@serialize({ group: "distance" }) followDistance: number;
	@serialize({ group: "distance" }) stopDistance: number;

	leader: EntityId | null = null;

	constructor(
		followDistance: number = 1.5 * TILE_SIZE,
		stopDistance: number = TILE_SIZE,
	) {
		this.followDistance = followDistance;
		this.stopDistance = stopDistance;
	}

	resolvedLeader(): EntityId | null {
		return this.leader ?? this.leaderRef.id;
	}
}
