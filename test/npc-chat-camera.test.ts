import { describe, expect, test } from "bun:test";
import { Camera2DFollowComponent } from "../src/engine/camera/camera-2d-follow-component";
import { DialogueComponent } from "../src/engine/dialogue/dialogue-component";
import type { EntityId } from "../src/engine/ecs";
import { TransformComponent } from "../src/engine/transform-component";
import { DialogueSourceComponent } from "../src/game/dialogue/dialogue-source-component";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
import { npcChatSequence } from "../src/game/sequence/npc-chat-sequence";
import {
	gameSequenceSceneConfig,
	inkStoryComponent,
} from "./support/game-sequence-scene";
import { SequenceFixture } from "./support/sequence-harness";

const followTargets = (
	fixture: SequenceFixture,
): readonly EntityId[] =>
	fixture.ecs.query(Camera2DFollowComponent)[0]![1].targets;

describe("npc-chat camera framing", () => {
	test("frames player and npc during the chat, restores to player after", async () => {
		const ink = "=== gossip ===\nThe well ran dry.\n-> DONE\n";
		let player: EntityId = "" as EntityId;
		let npc: EntityId = "" as EntityId;
		const fixture = await SequenceFixture.create(
			gameSequenceSceneConfig({
				def: npcChatSequence,
				seedScene: (world) => {
					world.ecs.createEntity([inkStoryComponent(ink)]);
					world.ecs.createEntity([new Camera2DFollowComponent()]);
					player = world.ecs.createEntity([
						new PlayerInputComponent(),
					]);
					npc = world.ecs.createEntity([
						new DialogueSourceComponent("gossip"),
						new TransformComponent(),
					]);
				},
				seedSequence: (component) => {
					component.run.blackboard.knot = "gossip";
					component.run.blackboard.npc = npc;
				},
			}),
		);

		fixture.step(1);
		expect(fixture.ecs.query(DialogueComponent).length).toBe(1);
		expect(followTargets(fixture)).toEqual([player, npc]);

		await fixture.saveAndReload();
		expect(followTargets(fixture)).toEqual([player, npc]);

		const open = fixture.ecs.query(DialogueComponent)[0]![0];
		fixture.ecs.destroy(open);
		fixture.step(2);
		expect(followTargets(fixture)).toEqual([player]);
		fixture.dispose();
	});
});
