import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import type { EntityId } from "../src/engine/ecs";
import { NavAgentComponent } from "../src/engine/nav/nav-agent-component";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { serializeWorld } from "../src/engine/serialization/serialize";
import type { UpdateContext } from "../src/engine/system";
import { TILE_SIZE } from "../src/engine/tilemap/tile";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";
import { FollowComponent } from "../src/game/follow/follow-component";
import { FollowSystem } from "../src/game/follow/follow-system";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

const step = (world: World): void => {
	new FollowSystem().update({
		ecs: world.ecs,
	} as unknown as UpdateContext);
};

const spawn = (
	world: World,
): { leader: EntityId; follower: EntityId } => {
	const leader = world.ecs.createEntity([
		new TransformComponent(new Vector2(0, 0)),
	]);
	const follower = world.ecs.createEntity([
		new FollowComponent(),
		new NavAgentComponent(),
		new TransformComponent(new Vector2(5 * TILE_SIZE, 0)),
	]);
	return { leader, follower };
};

test("escort round-trips and keeps following the same leader id", () => {
	const source = new World({ x: 0, y: 20 });
	const { leader, follower } = spawn(source);

	// The cutscene escort verb assigns the transient live leader.
	source.ecs.getComponent(follower, FollowComponent)!.leader = leader;
	step(source);

	// FollowSystem now maintains the persistent soft ref from the live leader.
	const live = source.ecs.getComponent(follower, FollowComponent)!;
	expect(live.leaderRef.id).toBe(leader);
	const liveAgent = source.ecs.getComponent(
		follower,
		NavAgentComponent,
	)!;
	expect(liveAgent.target).toBe(leader);

	const snapshot = serializeWorld(source.ecs);
	const followerSnap = snapshot.find((e) => e.id === follower)!;
	const followData = followerSnap.components.Follow as {
		leaderRef: { id: string | null };
	};
	expect(followData.leaderRef.id).toBe(leader);

	const target = new World({ x: 0, y: 20 });
	deserializeWorld(target, snapshot);

	// Transient leader is not serialized; the persisted soft ref carries the link.
	const restored = target.ecs.getComponent(
		follower,
		FollowComponent,
	)!;
	expect(restored.leader).toBeNull();
	expect(restored.leaderRef.id).toBe(leader);
	expect(restored.resolvedLeader()).toBe(leader);

	// After a tick the transient leader is re-derived and the escort keeps
	// following the same leader id.
	step(target);
	expect(restored.leader).toBe(leader);
	const agent = target.ecs.getComponent(follower, NavAgentComponent)!;
	expect(agent.target).toBe(leader);
});

test("follow purges the soft ref when the leader is gone", () => {
	const world = new World({ x: 0, y: 20 });
	const follower = world.ecs.createEntity([
		new FollowComponent(),
		new NavAgentComponent(),
		new TransformComponent(new Vector2(5 * TILE_SIZE, 0)),
	]);
	const follow = world.ecs.getComponent(follower, FollowComponent)!;
	follow.leaderRef.set("does-not-exist" as EntityId);

	step(world);

	expect(follow.leader).toBeNull();
	expect(follow.leaderRef.id).toBeNull();
});
