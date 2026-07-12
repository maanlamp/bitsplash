import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import { ECS, type EntityId } from "../src/engine/ecs";
import { FacingComponent } from "../src/engine/locomotion/facing-component";
import { MovementIntentComponent } from "../src/engine/locomotion/movement-intent-component";
import { NavAgentComponent } from "../src/engine/nav/nav-agent-component";
import { PerceptionComponent } from "../src/engine/perception/perception-component";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { serializeWorld } from "../src/engine/serialization/serialize";
import type { UpdateContext } from "../src/engine/system";
import { TILE_SIZE } from "../src/engine/tilemap/tile";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";
import { EnemyBrainComponent } from "../src/game/enemy/enemy-brain-component";
import { EnemyBrainSystem } from "../src/game/enemy/enemy-brain-system";
import { PerceptionSystem } from "../src/game/enemy/perception-system";
import { WanderComponent } from "../src/game/enemy/wander-component";
import { FactionComponent } from "../src/game/faction/faction-component";
import { HealthComponent } from "../src/game/health/health-component";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

const HOME = new Vector2(3 * TILE_SIZE, 5 * TILE_SIZE);
const TARGET_POS = new Vector2(HOME.x + 2 * TILE_SIZE, HOME.y);

type Ids = { enemy: EntityId; target: EntityId };

const spawn = (ecs: ECS): Ids => {
	const enemy = ecs.createEntity([
		new PerceptionComponent(),
		new EnemyBrainComponent(),
		new NavAgentComponent(),
		new MovementIntentComponent(),
		new TransformComponent(HOME.clone()),
		new HealthComponent(100, 100),
		new WanderComponent(),
	]);
	const target = ecs.createEntity([
		new TransformComponent(TARGET_POS.clone()),
		new HealthComponent(100, 100),
	]);
	return { enemy, target };
};

const step = (ecs: ECS, dt = 16): void => {
	new EnemyBrainSystem().update({
		dt,
		ecs,
	} as unknown as UpdateContext);
};

const brainState = (ecs: ECS, enemy: EntityId): string =>
	ecs.getComponent(enemy, EnemyBrainComponent)!.machine.current;

// Scripts PerceptionSystem output for a currently-visible target, exactly as
// enemy-brain.test.ts does -- the brain reads these fields, PerceptionSystem
// is exercised elsewhere.
const see = (ecs: ECS, enemy: EntityId, target: EntityId): void => {
	const p = ecs.getComponent(enemy, PerceptionComponent)!;
	const tt = ecs.getComponent(target, TransformComponent)!;
	p.canSeeTarget = true;
	p.targetId = target;
	p.detection = 1;
	p.lastStimulusPos = tt.position.clone();
	p.timeSinceStimulus = 0;
	p.timeSinceSeen = 0;
};

const driveIntoChase = (ecs: ECS, ids: Ids): void => {
	for (let i = 0; i < 120; i++) {
		see(ecs, ids.enemy, ids.target);
		step(ecs);
		if (brainState(ecs, ids.enemy) === "chase") {
			return;
		}
	}
};

test("mid-chase enemy resumes the chase after serialize round-trip", () => {
	const source = new World({ x: 0, y: 20 });
	const ids = spawn(source.ecs);
	// Anchor territory somewhere the enemy is NOT currently standing, so a lost
	// origin would be detectable.
	source.ecs.getComponent(ids.enemy, WanderComponent)!.origin =
		HOME.clone();

	driveIntoChase(source.ecs, ids);
	expect(brainState(source.ecs, ids.enemy)).toBe("chase");
	// A few more frames solidly in chase.
	for (let i = 0; i < 5; i++) {
		see(source.ecs, ids.enemy, ids.target);
		step(source.ecs);
	}
	expect(brainState(source.ecs, ids.enemy)).toBe("chase");

	const snapshot = serializeWorld(source.ecs);

	const target = new World({ x: 0, y: 20 });
	deserializeWorld(target, snapshot);

	// Cluster restored coherently: perception target + memory + wander origin.
	const rp = target.ecs.getComponent(ids.enemy, PerceptionComponent)!;
	expect(rp.targetId).toBe(ids.target);
	expect(rp.detection).toBeGreaterThan(0);
	expect(rp.lastStimulusPos).not.toBeNull();
	expect(rp.timeSinceSeen).toBeLessThan(1);
	const rw = target.ecs.getComponent(ids.enemy, WanderComponent)!;
	expect(rw.origin).not.toBeNull();
	expect(rw.origin!.x).toBe(HOME.x);
	expect(rw.origin!.y).toBe(HOME.y);
	expect(brainState(target.ecs, ids.enemy)).toBe("chase");

	// Step the brain WITHOUT re-scripting perception: it must resume the chase
	// from the restored perception state, not drain chase -> search -> patrol.
	for (let i = 0; i < 20; i++) {
		step(target.ecs);
	}
	expect(brainState(target.ecs, ids.enemy)).toBe("chase");
});

test("perception soft-ref purges a dangling target on use", () => {
	const world = new World({ x: 0, y: 20 });
	const enemy = world.ecs.createEntity([
		new PerceptionComponent(),
		new FactionComponent("hostile"),
		new TransformComponent(HOME.clone()),
		new FacingComponent(1),
	]);
	const p = world.ecs.getComponent(enemy, PerceptionComponent)!;
	p.targetId = "does-not-exist" as EntityId;

	new PerceptionSystem().update({
		dt: 16,
		ecs: world.ecs,
		world,
		events: world.events,
	} as unknown as UpdateContext);

	expect(p.targetId).toBeNull();
});
