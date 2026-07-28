import { expect, test } from "bun:test";
import { ECS } from "../src/engine/ecs";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { emotionStackHeight } from "../src/game/reaction/emotion-icon-hud-system";
import { ReactionComponent } from "../src/game/reaction/reaction-component";

/**
 * A reaction sets its emotion and adds its bark on the same frame, so an overhead
 * icon and an overhead bubble are the normal case. The bubble stacks above the
 * icon; these assert the clearance the two HUDs agree on, since each anchors
 * independently through `entityTop`.
 */

const npc = (ecs: ECS) =>
	ecs.createEntity([new TransformComponent(new Vector2(40, -12))]);

test("an entity with no reaction adds no clearance", () => {
	const ecs = new ECS();
	expect(emotionStackHeight(ecs, npc(ecs))).toBe(0);
});

test("a reaction with no emotion set adds no clearance", () => {
	const ecs = new ECS();
	const id = npc(ecs);
	const reaction = new ReactionComponent();
	reaction.emotion = null;
	ecs.addComponent(id, reaction);

	expect(emotionStackHeight(ecs, id)).toBe(0);
});

test("a reaction showing an emotion pushes anything stacked above it clear of the icon", () => {
	const ecs = new ECS();
	const id = npc(ecs);
	const reaction = new ReactionComponent();
	reaction.emotion = "surprised";
	ecs.addComponent(id, reaction);

	const clearance = emotionStackHeight(ecs, id);

	expect(clearance).toBeGreaterThan(0);
	expect(clearance).toBe(22);
});

test("the bark's gap grows by exactly the icon's stack height", () => {
	const ecs = new ECS();
	const bare = npc(ecs);
	const reacting = npc(ecs);
	const reaction = new ReactionComponent();
	reaction.emotion = "angry";
	ecs.addComponent(reacting, reaction);

	const barkOffset = 4;

	expect(barkOffset + emotionStackHeight(ecs, bare)).toBe(4);
	expect(barkOffset + emotionStackHeight(ecs, reacting)).toBe(26);
});
