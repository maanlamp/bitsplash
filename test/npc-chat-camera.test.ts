import { describe, expect, test } from "bun:test";
import { Camera2D } from "../src/engine/camera/camera-2d";
import { Camera2DComponent } from "../src/engine/camera/camera-2d-component";
import { Camera2DFollowComponent } from "../src/engine/camera/camera-2d-follow-component";
import { Camera2DFollowSystem } from "../src/engine/camera/camera-2d-follow-system";
import { CameraTransitionSystem } from "../src/engine/camera/camera-transition-system";
import { DialogueComponent } from "../src/engine/dialogue/dialogue-component";
import type { EntityId } from "../src/engine/ecs";
import { SequenceComponent } from "../src/engine/sequence/sequence-component";
import type { SequenceDef } from "../src/engine/sequence/sequence-def";
import {
	sequenceDefById,
	startSequence,
} from "../src/engine/sequence/sequence-system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { DialogueSourceComponent } from "../src/game/dialogue/dialogue-source-component";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
import { campfireStargazerSequence } from "../src/game/sequence/campfire-stargazer-sequence";
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

const followZoom = (fixture: SequenceFixture): number =>
	fixture.ecs.query(Camera2DFollowComponent)[0]![1].zoom;

const GAMEPLAY_ZOOM = 3;

describe("npc-chat camera framing", () => {
	test("frames player and npc during the chat, restores to player after", async () => {
		const ink =
			"=== gossip ===\nThe well ran dry. # speaker: quartermaster\n-> DONE\n";
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

type CutsceneScene = Readonly<{
	fixture: SequenceFixture;
	player: EntityId;
	companion: EntityId;
}>;

/**
 * A camera following the player (as {@link spawnCamera2D} leaves it), a companion
 * npc, and the real campfire cutscene wired to the real camera systems — the
 * shipped shape of "talk to the companion, watch the cutscene".
 */
const cutsceneScene = async (
	options: Readonly<{
		def?: SequenceDef;
		skipHeld?: () => boolean;
		seedSequence?: (
			component: SequenceComponent,
			actors: Readonly<{ player: EntityId; companion: EntityId }>,
		) => void;
	}> = {},
): Promise<CutsceneScene> => {
	let player: EntityId = "" as EntityId;
	let companion: EntityId = "" as EntityId;
	const fixture = await SequenceFixture.create(
		gameSequenceSceneConfig({
			def: options.def ?? campfireStargazerSequence,
			skipHeld: options.skipHeld,
			seedSequence: (component) =>
				options.seedSequence?.(component, { player, companion }),
			seedScene: (world) => {
				player = world.ecs.createEntity([
					new PlayerInputComponent(),
					new TransformComponent(),
				]);
				companion = world.ecs.createEntity([
					new DialogueSourceComponent("campfire.companion"),
					new TransformComponent(new Vector2(96, 0)),
				]);
				world.ecs.createEntity([
					new Camera2DComponent(
						new Camera2D(Vector2.zero(), GAMEPLAY_ZOOM),
					),
					new Camera2DFollowComponent({
						targets: [player],
						zoom: GAMEPLAY_ZOOM,
					}),
				]);
			},
			extraSystems: (world) => {
				world.ecs.addUpdateSystem(new Camera2DFollowSystem());
				world.ecs.addUpdateSystem(new CameraTransitionSystem());
			},
		}),
	);
	return { fixture, player, companion };
};

const runUntilIdle = (
	fixture: SequenceFixture,
	budget = 1200,
): void => {
	for (let frame = 0; frame < budget; frame++) {
		if (fixture.ecs.query(SequenceComponent).length === 0) {
			fixture.step(1);
			return;
		}
		fixture.step(1);
	}
	throw new Error(
		`sequence did not finish within ${budget} frames; camera assertions would be meaningless`,
	);
};

describe("cutscene camera ownership", () => {
	test("the campfire cutscene hands the camera back to the player when it ends", async () => {
		const { fixture, player, companion } = await cutsceneScene();

		fixture.step(30);
		expect(followTargets(fixture)).not.toEqual([player]);

		runUntilIdle(fixture);

		expect(followTargets(fixture)).toEqual([player]);
		expect(followTargets(fixture)).not.toContain(companion);
		expect(followZoom(fixture)).toBe(GAMEPLAY_ZOOM);
		fixture.dispose();
	});

	test("a cutscene skipped mid-run still hands the camera back", async () => {
		let skipping = false;
		const { fixture, player } = await cutsceneScene({
			skipHeld: () => skipping,
		});

		fixture.step(30);
		skipping = true;
		runUntilIdle(fixture);

		expect(followTargets(fixture)).toEqual([player]);
		expect(followZoom(fixture)).toBe(GAMEPLAY_ZOOM);
		fixture.dispose();
	});

	test("a cutscene queued from a companion chat hands the camera back after the whole chain", async () => {
		const { fixture, player } = await cutsceneScene({
			def: npcChatSequence,
			seedSequence: (component, actors) => {
				component.run.blackboard.knot = "campfire.companion";
				component.run.blackboard.npc = actors.companion;
			},
		});

		startSequence(fixture.ecs, sequenceDefById("campfire-stargazer"));
		fixture.step(1);
		expect(fixture.ecs.query(SequenceComponent)[0]![1].defId).toBe(
			"campfire-stargazer",
		);

		fixture.step(30);
		await fixture.saveAndReload();
		runUntilIdle(fixture);

		expect(followTargets(fixture)).toEqual([player]);
		expect(followZoom(fixture)).toBe(GAMEPLAY_ZOOM);
		fixture.dispose();
	});
});
