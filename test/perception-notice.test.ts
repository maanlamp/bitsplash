import { expect, test } from "bun:test";
import { ECS, type EntityId } from "../src/engine/ecs";
import EventBus from "../src/engine/events";
import { FacingComponent } from "../src/engine/locomotion/facing-component";
import { PerceptionComponent } from "../src/engine/perception/perception-component";
import type { UpdateContext } from "../src/engine/system";
import { TILE_SIZE } from "../src/engine/tilemap/tile";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { PerceptionSystem } from "../src/game/enemy/perception-system";
import { FactionComponent } from "../src/game/faction/faction-component";
import type { FactionId } from "../src/game/faction/faction-ids";
import { HealthComponent } from "../src/game/health/health-component";
import type { World } from "../src/engine/world";

/**
 * Perception's only use of the world is `raycast` for occlusion; an empty world
 * never occludes, which is exactly the "clear line of sight" case these
 * assertions are about.
 */
const openWorld = (): World =>
	({ raycast: () => null }) as unknown as World;

type Fixture = {
	ecs: ECS;
	step: (frames?: number) => void;
};

const fixture = (): Fixture => {
	const ecs = new ECS();
	const events = new EventBus();
	const world = openWorld();
	const system = new PerceptionSystem();
	return {
		ecs,
		step: (frames = 1) => {
			for (let i = 0; i < frames; i++) {
				system.update({
					dt: 1000 / 60,
					ecs,
					world,
					events,
				} as unknown as UpdateContext);
				events.clear();
			}
		},
	};
};

const perceiver = (
	ecs: ECS,
	faction: FactionId,
	x: number,
	dir = 1,
): EntityId =>
	ecs.createEntity([
		new PerceptionComponent(),
		new FactionComponent(faction),
		new TransformComponent(new Vector2(x, 0)),
		new FacingComponent(dir),
	]);

/** A creature with a faction and no Health — an NPC as the prefabs author it. */
const bystander = (
	ecs: ECS,
	faction: FactionId,
	x: number,
): EntityId =>
	ecs.createEntity([
		new FactionComponent(faction),
		new TransformComponent(new Vector2(x, 0)),
	]);

const perception = (ecs: ECS, id: EntityId): PerceptionComponent =>
	ecs.getComponent(id, PerceptionComponent)!;

test("a healthless folk NPC is a perception candidate and gets noticed", () => {
	const fx = fixture();
	const enemy = perceiver(fx.ecs, "margrave", 0);
	const npc = bystander(fx.ecs, "folk", 64);
	expect(fx.ecs.getComponent(npc, HealthComponent)).toBeUndefined();

	fx.step();

	expect(perception(fx.ecs, enemy).noticed).toContain(npc);
});

test("the notice pass applies no stance filter", () => {
	const fx = fixture();
	const enemy = perceiver(fx.ecs, "margrave", 0);
	const npc = bystander(fx.ecs, "folk", 48);
	const player = fx.ecs.createEntity([
		new FactionComponent("player"),
		new TransformComponent(new Vector2(96, 0)),
		new HealthComponent(),
	]);

	fx.step();

	const noticed = perception(fx.ecs, enemy).noticed;
	expect(noticed).toContain(npc);
	expect(noticed).toContain(player);
});

test("an NPC notices the player despite a neutral stance both ways", () => {
	const fx = fixture();
	const npc = perceiver(fx.ecs, "folk", 0);
	const player = fx.ecs.createEntity([
		new FactionComponent("player"),
		new TransformComponent(new Vector2(64, 0)),
		new HealthComponent(),
	]);

	fx.step();

	expect(perception(fx.ecs, npc).noticed).toContain(player);
	expect(perception(fx.ecs, npc).targetId).toBeNull();
});

test("combat targeting keeps the hostile filter: two margrave enemies never target each other", () => {
	const fx = fixture();
	const left = perceiver(fx.ecs, "margrave", 0, 1);
	const right = perceiver(fx.ecs, "margrave", 64, -1);
	fx.ecs.addComponent(left, new HealthComponent());
	fx.ecs.addComponent(right, new HealthComponent());

	fx.step(30);

	expect(perception(fx.ecs, left).targetId).toBeNull();
	expect(perception(fx.ecs, right).targetId).toBeNull();
	expect(perception(fx.ecs, left).noticed).toContain(right);
	expect(perception(fx.ecs, right).noticed).toContain(left);
});

test("an enemy still acquires the player past intervening NPCs", () => {
	const fx = fixture();
	const enemy = perceiver(fx.ecs, "margrave", 0);
	fx.ecs.addComponent(enemy, new HealthComponent());
	bystander(fx.ecs, "folk", 32);
	bystander(fx.ecs, "folk", 48);
	const player = fx.ecs.createEntity([
		new FactionComponent("player"),
		new TransformComponent(new Vector2(96, 0)),
		new HealthComponent(),
	]);

	fx.step(30);

	expect(perception(fx.ecs, enemy).targetId).toBe(player);
	expect(perception(fx.ecs, enemy).canSeeTarget).toBe(true);
});

test("an already-noticed entity survives the perceiver turning away, while it stays near", () => {
	const fx = fixture();
	const watcher = perceiver(fx.ecs, "folk", 0, 1);
	const near = bystander(fx.ecs, "player", 64);

	fx.step();
	expect(perception(fx.ecs, watcher).noticed).toContain(near);

	// A head sweep: nothing about the other entity changed.
	fx.ecs.getComponent(watcher, FacingComponent)!.dir = -1;
	fx.step(60);

	expect(perception(fx.ecs, watcher).noticed).toContain(near);
	expect(perception(fx.ecs, watcher).noticedExited).toEqual([]);

	fx.ecs.getComponent(watcher, FacingComponent)!.dir = 1;
	fx.step();

	expect(perception(fx.ecs, watcher).noticedEntered).toEqual([]);
});

test("stickiness ends at the notice proximity, not at the cone", () => {
	const fx = fixture();
	const watcher = perceiver(fx.ecs, "folk", 0, 1);
	const roamer = bystander(fx.ecs, "player", 64);
	const proximity =
		perception(fx.ecs, watcher).noticeProximityTiles * TILE_SIZE;

	fx.step();
	fx.ecs.getComponent(watcher, FacingComponent)!.dir = -1;

	// Out of the cone but inside the proximity: still noticed.
	fx.ecs.getComponent(roamer, TransformComponent)!.position =
		new Vector2(proximity - TILE_SIZE, 0);
	fx.step();
	expect(perception(fx.ecs, watcher).noticed).toContain(roamer);

	// One step past it: gone, and reported gone exactly once.
	fx.ecs.getComponent(roamer, TransformComponent)!.position =
		new Vector2(proximity + TILE_SIZE, 0);
	fx.step();
	expect(perception(fx.ecs, watcher).noticed).toEqual([]);
	expect(perception(fx.ecs, watcher).noticedExited).toEqual([roamer]);

	fx.step();
	expect(perception(fx.ecs, watcher).noticedExited).toEqual([]);
});

test("proximity alone never notices anything: entry still needs clear sight", () => {
	const fx = fixture();
	const watcher = perceiver(fx.ecs, "folk", 0, 1);
	// Right behind the watcher — well inside the proximity, never in the cone.
	bystander(fx.ecs, "player", -64);

	fx.step(60);

	expect(perception(fx.ecs, watcher).noticed).toEqual([]);
});

test("notice deltas report arrivals once and departures once", () => {
	const fx = fixture();
	const enemy = perceiver(fx.ecs, "margrave", 0);
	const npc = bystander(fx.ecs, "folk", 64);

	fx.step();
	expect(perception(fx.ecs, enemy).noticedEntered).toEqual([npc]);
	expect(perception(fx.ecs, enemy).noticedExited).toEqual([]);

	fx.step();
	expect(perception(fx.ecs, enemy).noticedEntered).toEqual([]);
	expect(perception(fx.ecs, enemy).noticed).toEqual([npc]);

	fx.ecs.getComponent(npc, TransformComponent)!.position =
		new Vector2(-500, 0);
	fx.step();
	expect(perception(fx.ecs, enemy).noticedExited).toEqual([npc]);
	expect(perception(fx.ecs, enemy).noticed).toEqual([]);

	fx.step();
	expect(perception(fx.ecs, enemy).noticedExited).toEqual([]);
});
