import { expect, test } from "bun:test";
import { Glob } from "bun";
import { ECS, type EntityId } from "../src/engine/ecs";
import EventBus from "../src/engine/events";
import { InkStoryComponent } from "../src/engine/ink/ink-story-component";
import { FacingComponent } from "../src/engine/locomotion/facing-component";
import { MovementIntentComponent } from "../src/engine/locomotion/movement-intent-component";
import { PerceptionComponent } from "../src/engine/perception/perception-component";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { serializeWorld } from "../src/engine/serialization/serialize";
import type { UpdateContext } from "../src/engine/system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import type { World } from "../src/engine/world";
import { CharacterComponent } from "../src/game/character/character-component";
import { BarkComponent } from "../src/game/dialogue/bark-component";
import { PerceptionSystem } from "../src/game/enemy/perception-system";
import { FactionComponent } from "../src/game/faction/faction-component";
import { HealthComponent } from "../src/game/health/health-component";
import { ReactionComponent } from "../src/game/reaction/reaction-component";
import { ReactionSystem } from "../src/game/reaction/reaction-system";
import { committedStory } from "./support/committed-story";

/** Every component, so the world round-trip reconstructs rather than skips. */
for (const path of new Glob(
	"src/{engine,game}/**/*-component.ts",
).scanSync(".")) {
	await import(`../${path.replace(/\\/g, "/")}`);
}

const FRAME_MS = 1000 / 60;
const frames = (seconds: number): number => Math.round(seconds * 60);

/** Perception's only world dependency is `raycast`; nothing here occludes. */
const openWorld = (ecs: ECS): World =>
	({ ecs, raycast: () => null }) as unknown as World;

type Fixture = {
	ecs: ECS;
	step: (count?: number) => void;
	/** Serialize the whole world, then rebuild it in a fresh ECS. */
	roundTrip: () => Fixture;
};

const NPC_HOME = new Vector2(0, 0);
const PLAYER_NEAR = new Vector2(64, 0);
/** Far enough out to clear the NPC's notice proximity, not just its cone. */
const PLAYER_FAR = new Vector2(-2000, 0);

let npcId: EntityId = "" as EntityId;
let playerId: EntityId = "" as EntityId;

const build = (ecs: ECS): Fixture => {
	const events = new EventBus();
	const perception = new PerceptionSystem();
	const reactions = new ReactionSystem();
	const ctx = {
		dt: FRAME_MS,
		ecs,
		world: openWorld(ecs),
		events,
	} as unknown as UpdateContext;
	return {
		ecs,
		step: (count = 1) => {
			for (let i = 0; i < count; i++) {
				perception.update(ctx);
				reactions.update(ctx);
				events.clear();
			}
		},
		roundTrip: () => {
			const blob = serializeWorld(ecs);
			const fresh = new ECS();
			deserializeWorld(openWorld(fresh), blob, "round-trip", "throw");
			return build(fresh);
		},
	};
};

/**
 * An NPC with a faction, perception and reactions — and deliberately no Health.
 *
 * `bramble` because the warm standing is the one the authored table gives a full
 * greet/farewell/cheer set to, which is what the arbitration assertions need.
 * The player faces the NPC, since a greeting now requires being engaged.
 */
const fixture = (): Fixture => {
	const ecs = new ECS();
	const ink = new InkStoryComponent();
	ink.story = committedStory();
	ecs.createEntity([ink]);
	npcId = ecs.createEntity([
		new PerceptionComponent(),
		new FactionComponent("folk"),
		new TransformComponent(NPC_HOME.clone()),
		new FacingComponent(1),
		new ReactionComponent("npc"),
		new CharacterComponent("bramble"),
	]);
	playerId = ecs.createEntity([
		new FactionComponent("player"),
		new TransformComponent(PLAYER_NEAR.clone()),
		new FacingComponent(-1),
		new MovementIntentComponent(),
		new HealthComponent(),
	]);
	return build(ecs);
};

const reaction = (fx: Fixture): ReactionComponent =>
	fx.ecs.getComponent(npcId, ReactionComponent)!;

const bark = (fx: Fixture): BarkComponent | undefined =>
	fx.ecs.getComponent(npcId, BarkComponent);

const movePlayer = (fx: Fixture, to: Vector2): void => {
	fx.ecs.getComponent(playerId, TransformComponent)!.position =
		to.clone();
};

/** Step until the lifecycle reaches `phase`, failing loudly if it never does. */
const stepUntil = (
	fx: Fixture,
	phase: string,
	budget = 600,
): void => {
	for (let i = 0; i < budget; i++) {
		if (reaction(fx).machine.current === phase) {
			return;
		}
		fx.step();
	}
	throw new Error(
		`reaction never reached "${phase}"; stuck in "${reaction(fx).machine.current}"`,
	);
};

test("noticing the player fires npc-greet once, with its authored emotion and bark", () => {
	const fx = fixture();

	fx.step();

	expect(reaction(fx).current).toBe("npc-greet");
	expect(reaction(fx).emotion).toBe("happy");
	expect(reaction(fx).machine.current).toBe("entering");
	expect(reaction(fx).sinceFired["npc-greet"]).toBe(0);

	expect(bark(fx)!.text).toBe("Ah, there you are.");
	expect(bark(fx)!.ttl.seconds).toBe(2.5);

	// Still in view every following frame, yet the reaction fires only once:
	// noticedEntered is a delta, not the whole set.
	fx.step(frames(1));
	expect(reaction(fx).current).toBe("npc-greet");
	expect(reaction(fx).machine.current).toBe("holding");
	expect(reaction(fx).sinceFired["npc-greet"]).toBeCloseTo(1, 1);
});

test("the lifecycle runs entering to holding to exiting to idle, then clears", () => {
	const fx = fixture();

	fx.step();
	expect(reaction(fx).machine.current).toBe("entering");
	stepUntil(fx, "holding");
	stepUntil(fx, "exiting");
	stepUntil(fx, "idle");

	expect(reaction(fx).current).toBeNull();
	expect(reaction(fx).emotion).toBeNull();
});

test("arbitration takes the highest-priority eligible reaction, then the next one down", () => {
	const fx = fixture();

	fx.step();
	expect(reaction(fx).current).toBe("npc-greet");
	stepUntil(fx, "idle");

	movePlayer(fx, PLAYER_FAR);
	fx.step();
	expect(reaction(fx).current).toBe("npc-farewell");
	expect(reaction(fx).emotion).toBe("sad");
	expect(bark(fx)!.text).toBe("Off again, then.");
	stepUntil(fx, "idle");

	// Noticed again. npc-greet is authored `once` and already spent, so the
	// lower-priority npc-cheer takes the same stimulus.
	movePlayer(fx, PLAYER_NEAR);
	fx.step();
	expect(reaction(fx).current).toBe("npc-cheer");
	expect(reaction(fx).emotion).toBe("curious");
	expect(bark(fx)!.text).toBe("Back so soon?");
});

test("nothing fires once every reaction for a stimulus is spent or cooling down", () => {
	const fx = fixture();

	fx.step();
	stepUntil(fx, "idle");
	movePlayer(fx, PLAYER_FAR);
	fx.step();
	stepUntil(fx, "idle");
	movePlayer(fx, PLAYER_NEAR);
	fx.step();
	stepUntil(fx, "idle");

	const spent = { ...reaction(fx).sinceFired };
	expect(Object.keys(spent).sort()).toEqual([
		"npc-cheer",
		"npc-farewell",
		"npc-greet",
	]);

	movePlayer(fx, PLAYER_FAR);
	fx.step();
	expect(reaction(fx).current).toBeNull();
	expect(reaction(fx).machine.current).toBe("idle");

	movePlayer(fx, PLAYER_NEAR);
	fx.step();
	expect(reaction(fx).current).toBeNull();
	expect(reaction(fx).machine.current).toBe("idle");
});

test("a reaction mid-lifetime survives a whole-world capture and restore", () => {
	const before = fixture();

	before.step(frames(0.5));
	expect(reaction(before).machine.current).toBe("holding");
	const elapsed = reaction(before).machine.elapsed;
	const since = reaction(before).sinceFired["npc-greet"]!;
	const noticed = [
		...before.ecs.getComponent(npcId, PerceptionComponent)!.noticed,
	];
	expect(reaction(before).engaged).toEqual([playerId]);

	const after = before.roundTrip();

	expect(reaction(after).current).toBe("npc-greet");
	expect(reaction(after).emotion).toBe("happy");
	expect(reaction(after).machine.current).toBe("holding");
	expect(reaction(after).machine.elapsed).toBeCloseTo(elapsed);
	expect(reaction(after).sinceFired["npc-greet"]).toBeCloseTo(since);
	expect(
		after.ecs.getComponent(npcId, PerceptionComponent)!.noticed,
	).toEqual(noticed);

	// A restored perceiver must not report what it already sees as newly
	// noticed, or every reaction re-fires on load.
	after.step();
	expect(
		after.ecs.getComponent(npcId, PerceptionComponent)!
			.noticedEntered,
	).toEqual([]);
	expect(reaction(after).current).toBe("npc-greet");

	// The rest of the lifetime plays out on the restored world.
	stepUntil(after, "exiting");
	stepUntil(after, "idle");
	expect(reaction(after).current).toBeNull();
	expect(reaction(after).sinceFired["npc-greet"]).toBeGreaterThan(
		2.5,
	);
});

test("a restore does not read a player already stood there as having just walked up", () => {
	const before = fixture();

	before.step();
	stepUntil(before, "idle");
	expect(reaction(before).engaged).toEqual([playerId]);

	const after = before.roundTrip();
	after.step(frames(2));

	expect(reaction(after).current).toBeNull();
	expect(reaction(after).machine.current).toBe("idle");
	expect(Object.keys(reaction(after).sinceFired)).toEqual([
		"npc-greet",
	]);
});
