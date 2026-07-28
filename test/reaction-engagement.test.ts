import { expect, test } from "bun:test";
import { ECS, type EntityId } from "../src/engine/ecs";
import EventBus from "../src/engine/events";
import { InkStoryComponent } from "../src/engine/ink/ink-story-component";
import { FacingComponent } from "../src/engine/locomotion/facing-component";
import { MovementIntentComponent } from "../src/engine/locomotion/movement-intent-component";
import { PerceptionComponent } from "../src/engine/perception/perception-component";
import type { UpdateContext } from "../src/engine/system";
import { TILE_SIZE } from "../src/engine/tilemap/tile";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import type { World } from "../src/engine/world";
import { CharacterComponent } from "../src/game/character/character-component";
import type { CharacterId } from "../src/game/character/character-ids";
import { characterById } from "../src/game/character/character-descriptor";
import { standingTowardPlayer } from "../src/game/character/reputation";
import { BarkComponent } from "../src/game/dialogue/bark-component";
import { PerceptionSystem } from "../src/game/enemy/perception-system";
import { FactionComponent } from "../src/game/faction/faction-component";
import { HealthComponent } from "../src/game/health/health-component";
import { ReactionComponent } from "../src/game/reaction/reaction-component";
import { ReactionSystem } from "../src/game/reaction/reaction-system";
import { committedStory } from "./support/committed-story";

/**
 * The playtest complaints these pin down, in the user's words: barks were "too
 * frequent", fired when you "walk into their fov, walk past them", and fired
 * again when an NPC "turn[s] around and they act like you left and came back".
 *
 * Every assertion runs the real `PerceptionSystem` then the real
 * `ReactionSystem` in composition order against the committed reaction tables
 * and the committed ink, because the fix is spread across all three.
 */

const FRAME_MS = 1000 / 60;

/** Perception's only world dependency is `raycast`; nothing here occludes. */
const openWorld = (ecs: ECS): World =>
	({ ecs, raycast: () => null }) as unknown as World;

type Fixture = {
	ecs: ECS;
	player: EntityId;
	step: (count?: number) => void;
};

const build = (ecs: ECS, player: EntityId): Fixture => {
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
		player,
		step: (count = 1) => {
			for (let i = 0; i < count; i++) {
				perception.update(ctx);
				reactions.update(ctx);
				events.clear();
			}
		},
	};
};

const NPC_X = 0;
const PLAYER_START_X = 100;
/** Comfortably outside the default 10-tile notice proximity. */
const AWAY_X = -40 * TILE_SIZE;

/** An NPC as the prefabs author one: folk faction, no Health, a character. */
const npc = (ecs: ECS, character: CharacterId): EntityId =>
	ecs.createEntity([
		new PerceptionComponent(6, 0.9),
		new FactionComponent("folk"),
		new TransformComponent(new Vector2(NPC_X, 0)),
		new FacingComponent(1),
		new ReactionComponent("npc"),
		new CharacterComponent(character),
	]);

const fixture = (): Fixture => {
	const ecs = new ECS();
	const ink = new InkStoryComponent();
	ink.story = committedStory();
	ecs.createEntity([ink]);
	const player = ecs.createEntity([
		new FactionComponent("player"),
		new TransformComponent(new Vector2(PLAYER_START_X, 0)),
		new FacingComponent(1),
		new MovementIntentComponent(),
		new HealthComponent(),
	]);
	return build(ecs, player);
};

/** Face the player along `dir` and walk them that way for `frames` frames. */
const walk = (fx: Fixture, dir: number, frames: number): void => {
	const transform = fx.ecs.getComponent(
		fx.player,
		TransformComponent,
	)!;
	const intent = fx.ecs.getComponent(
		fx.player,
		MovementIntentComponent,
	)!;
	const facing = fx.ecs.getComponent(fx.player, FacingComponent)!;
	for (let i = 0; i < frames; i++) {
		intent.moveX = dir;
		facing.dir = dir;
		transform.position = new Vector2(
			transform.position.x + dir,
			transform.position.y,
		);
		fx.step();
	}
};

/** Teleport the player somewhere and stop them dead. */
const placePlayer = (fx: Fixture, x: number): void => {
	fx.ecs.getComponent(fx.player, TransformComponent)!.position =
		new Vector2(x, 0);
	fx.ecs.getComponent(fx.player, MovementIntentComponent)!.moveX = 0;
};

const reaction = (fx: Fixture, id: EntityId): ReactionComponent =>
	fx.ecs.getComponent(id, ReactionComponent)!;

const bark = (fx: Fixture, id: EntityId): BarkComponent | undefined =>
	fx.ecs.getComponent(id, BarkComponent);

/** Long enough for any authored reaction to enter, hold and exit. */
const LIFETIME_FRAMES = 300;

test("walking past an NPC, never facing it and never closing, says nothing", () => {
	const fx = fixture();
	const id = npc(fx.ecs, "bramble");

	walk(fx, 1, 60);

	expect(reaction(fx, id).current).toBeNull();
	expect(reaction(fx, id).sinceFired).toEqual({});
	expect(bark(fx, id)).toBeUndefined();
});

test("the NPC saw the player it declined to greet — the gate is engagement, not sight", () => {
	const fx = fixture();
	const id = npc(fx.ecs, "bramble");

	walk(fx, 1, 60);

	expect(
		fx.ecs.getComponent(id, PerceptionComponent)!.noticed,
	).toContain(fx.player);
});

test("approaching an NPC greets, and the bark is typeset in the speaker's own font", () => {
	const fx = fixture();
	const id = npc(fx.ecs, "bramble");

	walk(fx, -1, 10);

	expect(reaction(fx, id).current).toBe("npc-greet");
	expect(bark(fx, id)!.text).toBe("Ah, there you are.");
	expect(bark(fx, id)!.font).toBe(characterById("bramble").font);
});

test("standing still while facing an NPC counts as engaging it", () => {
	const fx = fixture();
	const id = npc(fx.ecs, "bramble");
	fx.ecs.getComponent(fx.player, FacingComponent)!.dir = -1;

	fx.step();

	expect(reaction(fx, id).current).toBe("npc-greet");
});

test("turning round and walking back to an NPC that already saw you does greet", () => {
	const fx = fixture();
	const id = npc(fx.ecs, "bramble");

	// Noticed on the way out, so nothing is said — and the player never leaves the
	// notice proximity, so awareness never lapses.
	walk(fx, 1, 60);
	expect(reaction(fx, id).current).toBeNull();
	expect(
		fx.ecs.getComponent(id, PerceptionComponent)!.noticed,
	).toContain(fx.player);

	// Deliberately coming back is a new event even though being seen was not.
	walk(fx, -1, 10);

	expect(reaction(fx, id).current).toBe("npc-greet");
});

test("an NPC turning away and back does not re-fire: it never lost the player", () => {
	const fx = fixture();
	const id = npc(fx.ecs, "bramble");
	const facing = fx.ecs.getComponent(id, FacingComponent)!;

	walk(fx, -1, 10);
	expect(reaction(fx, id).current).toBe("npc-greet");
	fx.step(LIFETIME_FRAMES);

	// The NPC sweeps its head away and back while the player stands right there.
	facing.dir = -1;
	fx.step(120);
	expect(
		fx.ecs.getComponent(id, PerceptionComponent)!.noticed,
	).toContain(fx.player);
	facing.dir = 1;
	fx.step(120);

	expect(reaction(fx, id).current).toBeNull();
	expect(Object.keys(reaction(fx, id).sinceFired)).toEqual([
		"npc-greet",
	]);
});

test("genuinely leaving and coming back does react again — with a different line", () => {
	const fx = fixture();
	const id = npc(fx.ecs, "bramble");

	walk(fx, -1, 10);
	expect(reaction(fx, id).current).toBe("npc-greet");
	fx.step(LIFETIME_FRAMES);

	placePlayer(fx, AWAY_X);
	fx.step();
	expect(reaction(fx, id).current).toBe("npc-farewell");
	fx.step(LIFETIME_FRAMES);

	placePlayer(fx, PLAYER_START_X);
	walk(fx, -1, 10);

	expect(reaction(fx, id).current).toBe("npc-cheer");
});

test("a greeting fires once per character, never a second time", () => {
	const fx = fixture();
	const id = npc(fx.ecs, "bramble");

	walk(fx, -1, 10);
	expect(reaction(fx, id).current).toBe("npc-greet");
	fx.step(LIFETIME_FRAMES);

	// Wander off, wait out every authored cooldown twice over, come back.
	placePlayer(fx, AWAY_X);
	fx.step(60 * 300);
	expect(reaction(fx, id).sinceFired["npc-greet"]).toBeGreaterThan(
		300,
	);

	placePlayer(fx, PLAYER_START_X);
	walk(fx, -1, 10);

	expect(reaction(fx, id).current).not.toBe("npc-greet");
});

test("standing splits one stimulus into different reactions: bramble greets, the stranger sizes you up", () => {
	const fx = fixture();
	const warm = npc(fx.ecs, "bramble");
	const wary = npc(fx.ecs, "stranger");

	expect(standingTowardPlayer("bramble")).toBe("warm");
	expect(standingTowardPlayer("stranger")).toBe("wary");

	walk(fx, -1, 10);

	expect(reaction(fx, warm).current).toBe("npc-greet");
	expect(reaction(fx, wary).current).toBe("npc-wary");
	expect(bark(fx, warm)!.text).not.toBe(bark(fx, wary)!.text);
});

test("a standing no row covers stays silent: the critter clocks you and says nothing", () => {
	const fx = fixture();
	const id = npc(fx.ecs, "critter");

	expect(standingTowardPlayer("critter")).toBe("cold");

	walk(fx, -1, 10);

	expect(reaction(fx, id).current).toBeNull();
	expect(bark(fx, id)).toBeUndefined();
	expect(
		fx.ecs.getComponent(id, PerceptionComponent)!.noticed,
	).toContain(fx.player);
});

test("a reacting entity with no character crashes rather than guessing a standing", () => {
	const fx = fixture();
	fx.ecs.createEntity([
		new PerceptionComponent(6, 0.9),
		new FactionComponent("folk"),
		new TransformComponent(new Vector2(NPC_X, 0)),
		new FacingComponent(1),
		new ReactionComponent("npc"),
	]);

	expect(() => fx.step()).toThrow(/no Character/);
});
