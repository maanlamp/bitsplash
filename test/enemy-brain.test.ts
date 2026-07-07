import { expect, test } from "bun:test";
import { ECS, type EntityId } from "../src/engine/ecs";
import EventBus from "../src/engine/events";
import { StateMachineComponent } from "../src/engine/fsm/state-machine-component";
import { StateMachineSystem } from "../src/engine/fsm/state-machine-system";
import { MovementIntentComponent } from "../src/engine/locomotion/movement-intent-component";
import { NavAgentComponent } from "../src/engine/nav/nav-agent-component";
import { PerceptionComponent } from "../src/engine/perception/perception-component";
import type { UpdateContext } from "../src/engine/system";
import { TILE_SIZE } from "../src/engine/tilemap/tile";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { EnemyBrainComponent } from "../src/game/enemy/enemy-brain-component";
import "../src/game/enemy/enemy-brain-def";
import { EnemyBrainSystem } from "../src/game/enemy/enemy-brain-system";
import { WanderComponent } from "../src/game/enemy/wander-component";
import { HealthComponent } from "../src/game/health/health-component";

// Drives the REAL EnemyBrainSystem + StateMachineSystem over a constructed
// world. Perception and nav status are scripted (the systems that produce them
// are exercised elsewhere), so these tests cover writeParams + the FSM + actuate
// as one unit -- the seam where the pursuit/leash bugs actually lived.

const HOME = new Vector2(0, 0);

function makeWorld() {
	const ecs = new ECS();
	const events = new EventBus();
	const sm = new StateMachineSystem();
	const brain = new EnemyBrainSystem();

	const perception = new PerceptionComponent();
	const agent = new NavAgentComponent();
	const transform = new TransformComponent(HOME.clone());
	const wander = new WanderComponent();
	wander.origin = HOME.clone();

	const enemy = ecs.createEntity([
		new StateMachineComponent(null, "enemy-brain"),
		perception,
		new EnemyBrainComponent(),
		agent,
		new MovementIntentComponent(),
		transform,
		new HealthComponent(100, 100),
		wander,
	]);
	const smc = ecs.getComponent(enemy, StateMachineComponent)!;

	const target = ecs.createEntity([
		new TransformComponent(new Vector2(0, 0)),
		new HealthComponent(100, 100),
	]);
	const targetTransform = ecs.getComponent(
		target,
		TransformComponent,
	)!;

	const step = (dt = 16): void => {
		const ctx = { dt, ecs, events } as unknown as UpdateContext;
		brain.update(ctx);
		sm.update(ctx);
		events.clear();
	};

	// Simulate PerceptionSystem output for a currently-visible target.
	const see = (): void => {
		perception.canSeeTarget = true;
		perception.targetId = target as EntityId;
		perception.detection = 1;
		perception.lastStimulusPos = targetTransform.position.clone();
		perception.timeSinceStimulus = 0;
		perception.timeSinceSeen = 0;
	};
	// Simulate having lost sight for `seconds` (memory retained).
	const lostFor = (seconds: number): void => {
		perception.canSeeTarget = false;
		perception.timeSinceSeen = seconds;
		perception.timeSinceStimulus = seconds;
		perception.detection = 0;
	};
	const state = (): string => smc.current;

	return {
		ecs,
		step,
		see,
		lostFor,
		state,
		perception,
		agent,
		wander,
		transform,
		targetTransform,
	};
}

function runUntil(
	w: ReturnType<typeof makeWorld>,
	predicate: () => boolean,
	maxFrames = 600,
	between?: () => void,
): boolean {
	for (let i = 0; i < maxFrames; i++) {
		between?.();
		w.step();
		if (predicate()) {
			return true;
		}
	}
	return false;
}

test("spots a hostile in front and escalates patrol -> chase -> attack", () => {
	const w = makeWorld();
	w.targetTransform.position = new Vector2(TILE_SIZE, 0); // 1 tile away
	w.agent.status = "moving";

	const reached = runUntil(
		w,
		() => w.state() === "attack",
		120,
		() => {
			w.see();
		},
	);
	expect(reached).toBe(true);
});

test("does NOT abandon a VISIBLE fleeing target past its territory", () => {
	const w = makeWorld();
	// Drive into chase while seeing a nearby target.
	w.targetTransform.position = new Vector2(2 * TILE_SIZE, 0);
	runUntil(
		w,
		() => w.state() === "chase",
		120,
		() => w.see(),
	);
	expect(w.state()).toBe("chase");

	// Target flees far beyond the aggro circle but stays visible.
	for (let i = 0; i < 120; i++) {
		w.targetTransform.position = new Vector2(40 * TILE_SIZE, 0);
		w.see();
		w.step();
	}
	expect(w.state()).toBe("chase");
});

test("gives up when the target is lost and returns to patrol (no deadlock)", () => {
	const w = makeWorld();
	w.targetTransform.position = new Vector2(2 * TILE_SIZE, 0);
	runUntil(
		w,
		() => w.state() === "chase",
		120,
		() => w.see(),
	);
	expect(w.state()).toBe("chase");

	// Lose the target for good; nav reports it reached the last-known spot.
	w.agent.status = "arrived";
	const backToPatrol = runUntil(
		w,
		() => w.state() === "patrol",
		600,
		() => w.lostFor(10),
	);
	expect(backToPatrol).toBe(true);
});

test("clears the stale nav target on re-entering patrol", () => {
	const w = makeWorld();
	w.targetTransform.position = new Vector2(2 * TILE_SIZE, 0);
	runUntil(
		w,
		() => w.state() === "chase",
		120,
		() => w.see(),
	);

	w.agent.status = "arrived";
	runUntil(
		w,
		() => w.state() === "patrol",
		600,
		() => w.lostFor(10),
	);
	expect(w.state()).toBe("patrol");
	// The stale-target clear runs on the brain's next tick after entering
	// patrol (brain and state machine are separate systems).
	w.lostFor(10);
	w.step();
	expect(w.agent.target).toBeNull();
	expect(w.wander.nextAt).toBe(0);
});

test("stays engaged when provoked past territory (WoW leash-break)", () => {
	const w = makeWorld();
	w.targetTransform.position = new Vector2(2 * TILE_SIZE, 0);
	runUntil(
		w,
		() => w.state() === "chase",
		120,
		() => w.see(),
	);

	// Lost sight, far away, but keeps getting hit -> must not return to patrol.
	let reachedPatrol = false;
	for (let i = 0; i < 300; i++) {
		w.targetTransform.position = new Vector2(40 * TILE_SIZE, 0);
		w.lostFor(2);
		w.perception.timeSinceDamage = 0; // freshly damaged this frame
		w.step();
		if (w.state() === "patrol") {
			reachedPatrol = true;
		}
	}
	expect(reachedPatrol).toBe(false);
});

test("a brief one-frame loss of sight does not drop the chase", () => {
	const w = makeWorld();
	w.targetTransform.position = new Vector2(2 * TILE_SIZE, 0);
	runUntil(
		w,
		() => w.state() === "chase",
		120,
		() => w.see(),
	);
	expect(w.state()).toBe("chase");

	w.lostFor(0.05); // blink
	w.step();
	expect(w.state()).toBe("chase");
});
