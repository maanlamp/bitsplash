import type { EntityId, ReadonlyECS } from "../ecs";
import { LocomotionComponent } from "../locomotion/locomotion-component";
import type { PhysicsBodyComponent } from "../physics/physics-body-component";
import { TILE_SIZE } from "../tilemap/tile";
import { NavAgentComponent } from "./nav-agent-component";
import type { NavProfile } from "./nav-graph-builder";

export const resolveNavProfile = (
	ecs: ReadonlyECS,
	id: EntityId,
	rb: PhysicsBodyComponent,
	gravity: number,
): NavProfile => {
	const loco = ecs.getComponent(id, LocomotionComponent);
	const agent = ecs.getComponent(id, NavAgentComponent);
	return {
		halfWidth: rb.halfWidth,
		heightPx: rb.halfHeight * 2,
		jumpSpeed: agent?.jumpSpeed || loco?.jumpSpeed || 0,
		moveSpeed: agent?.moveSpeed || loco?.maxSpeed || 0,
		maxDropHeight: agent?.maxDropHeight ?? 8 * TILE_SIZE,
		gravity,
	};
};
