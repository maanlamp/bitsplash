import { NavAgentComponent } from "../../engine/nav/nav-agent-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import { FollowComponent } from "./follow-component";

export class FollowSystem implements UpdateSystem {
	update({ ecs }: UpdateContext): void {
		for (const [, follow, agent, transform] of ecs.query(
			FollowComponent,
			NavAgentComponent,
			TransformComponent,
		)) {
			const leaderId = follow.resolvedLeader();
			if (!leaderId) {
				continue;
			}
			const leader = ecs.getComponent(leaderId, TransformComponent);
			if (!leader) {
				follow.leader = null;
				follow.leaderRef.set(null);
				continue;
			}
			follow.leader = leaderId;
			follow.leaderRef.set(leaderId);
			const dist = transform.position.distanceTo(leader.position);
			if (dist <= follow.stopDistance) {
				if (agent.target !== null) {
					agent.target = null;
				}
			} else if (dist > follow.followDistance) {
				if (agent.target !== leaderId) {
					agent.target = leaderId;
				}
			}
		}
	}
}
