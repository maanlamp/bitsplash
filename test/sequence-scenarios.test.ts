import { describe, expect, test } from "bun:test";
import {
	dialogue,
	parallel,
	seq,
	sequenceDef,
	spawn,
} from "../src/engine/sequence/builder";
import { registerSequenceDef } from "../src/engine/sequence/sequence-system";
import { SequenceComponent } from "../src/engine/sequence/sequence-component";
import { DialogueComponent } from "../src/engine/dialogue/dialogue-component";
import type { EntityId } from "../src/engine/ecs";
import { TransformComponent } from "../src/engine/transform-component";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
import { DialogueSourceComponent } from "../src/game/dialogue/dialogue-source-component";
import { SequenceTagComponent } from "../src/game/sequence/sequence-tag-component";
import { npcChatSequence } from "../src/game/sequence/npc-chat-sequence";
import { registerPrefab } from "../src/game/prefabs";
import {
	gameSequenceSceneConfig,
	inkStoryComponent,
} from "./support/game-sequence-scene";
import { SequenceFixture } from "./support/sequence-harness";
import {
	SequenceProbeComponent,
	sequenceSceneConfig,
	TEST_OP,
	testOp,
} from "./support/sequence-scene";

const transformPrefab = () => ({
	components: {
		Transform: {
			position: { $type: "Vector2", x: 0, y: 0 },
			rotation: { $type: "Angle", radians: 0 },
			scale: { $type: "Vector2", x: 1, y: 1 },
		},
	},
});

const taggedCount = (fixture: SequenceFixture, tag: string): number =>
	fixture.ecs
		.query(SequenceTagComponent)
		.filter(([, t]) => t.tag === tag).length;

const dialogueIds = (fixture: SequenceFixture): EntityId[] =>
	fixture.ecs.query(DialogueComponent).map(([id]) => id);

const counts = (fixture: SequenceFixture): Record<string, number> => {
	const entry = fixture.ecs.query(SequenceProbeComponent)[0];
	return entry ? entry[1].counts : {};
};

const hold = (stepId: string, counter: string, frames: number) =>
	testOp(TEST_OP.hold, stepId, { counter, frames });

describe("sequence save/load acceptance scenarios", () => {
	test("an op's effect fires exactly once across save/load", async () => {
		const def = sequenceDef({
			id: "effect-once",
			class: "exclusive",
			cast: {},
			root: seq("root", hold("effect", "fx", 6)),
		});
		const fixture = await SequenceFixture.create(
			sequenceSceneConfig(def),
		);

		fixture.step(1);
		expect(counts(fixture).fx).toBe(1);
		await fixture.saveAndReload();
		fixture.step(10);

		expect(counts(fixture).fx).toBe(1);
		expect(fixture.ecs.query(SequenceComponent).length).toBe(0);
		fixture.dispose();
	});

	test("spawned entities are not duplicated across save/load", async () => {
		registerPrefab("critter-test", transformPrefab());
		const def = sequenceDef({
			id: "spawn-once",
			class: "exclusive",
			cast: {},
			root: seq(
				"root",
				spawn("spawn", {
					prefab: "critter-test",
					at: { x: 10, y: 20 },
					bind: "critter",
					tag: "critter-x",
				}),
				hold("hold", "held", 100),
			),
		});
		const fixture = await SequenceFixture.create(
			gameSequenceSceneConfig({ def }),
		);

		fixture.step(1);
		expect(taggedCount(fixture, "critter-x")).toBe(1);

		await fixture.saveAndReload();
		fixture.step(5);

		expect(taggedCount(fixture, "critter-x")).toBe(1);
		expect(fixture.ecs.query(SequenceComponent).length).toBe(1);
		fixture.dispose();
	});

	test("dialogue is not reopened when saving mid-dialogue", async () => {
		const def = sequenceDef({
			id: "dialogue-once",
			class: "exclusive",
			cast: {},
			root: seq("root", dialogue("line", { knot: "greet" })),
		});
		const ink =
			"=== greet ===\nHello there, traveler. # speaker: quartermaster\n-> DONE\n";
		const fixture = await SequenceFixture.create(
			gameSequenceSceneConfig({
				def,
				seedScene: (world) => {
					world.ecs.createEntity([inkStoryComponent(ink)]);
				},
			}),
		);

		fixture.step(1);
		const before = dialogueIds(fixture);
		expect(before.length).toBe(1);

		await fixture.saveAndReload();
		fixture.step(3);

		const after = dialogueIds(fixture);
		expect(after.length).toBe(1);
		expect(after[0]).toBe(before[0]!);

		fixture.ecs.destroy(after[0]!);
		fixture.step(2);
		expect(fixture.ecs.query(DialogueComponent).length).toBe(0);
		expect(fixture.ecs.query(SequenceComponent).length).toBe(0);
		fixture.dispose();
	});

	test("save mid-parallel restores children at their individual steps", async () => {
		const def = sequenceDef({
			id: "mid-parallel",
			class: "exclusive",
			cast: {},
			root: seq(
				"root",
				parallel("par", hold("short", "A", 2), hold("long", "B", 8)),
			),
		});
		const fixture = await SequenceFixture.create(
			sequenceSceneConfig(def),
		);

		fixture.step(3);
		expect(counts(fixture).A).toBe(1);
		expect(counts(fixture).B).toBe(1);
		expect(fixture.ecs.query(SequenceComponent).length).toBe(1);

		await fixture.saveAndReload();
		fixture.step(8);

		expect(counts(fixture).A).toBe(1);
		expect(counts(fixture).B).toBe(1);
		expect(fixture.ecs.query(SequenceComponent).length).toBe(0);
		fixture.dispose();
	});

	test("stale save whose step id was renamed crashes loudly", async () => {
		const before = sequenceDef({
			id: "divergence",
			class: "exclusive",
			cast: {},
			root: seq(
				"root",
				hold("will-rename", "x", 1),
				hold("tail", "t", 60),
			),
		});
		const fixture = await SequenceFixture.create(
			sequenceSceneConfig(before),
		);

		fixture.step(3);
		await fixture.saveAndReload();

		registerSequenceDef(
			sequenceDef({
				id: "divergence",
				class: "exclusive",
				cast: {},
				root: seq(
					"root",
					hold("renamed-step", "x", 1),
					hold("tail", "t", 60),
				),
			}),
		);

		expect(() => fixture.step()).toThrow(/no longer exists/);
		fixture.dispose();
	});

	test("save mid-NPC-chat restores in a fresh process (regression)", async () => {
		const ink =
			"=== gossip ===\nThe well ran dry, they say. # speaker: quartermaster\n-> DONE\n";
		let npc: EntityId = "" as EntityId;
		const fixture = await SequenceFixture.create(
			gameSequenceSceneConfig({
				def: npcChatSequence,
				seedScene: (world) => {
					world.ecs.createEntity([inkStoryComponent(ink)]);
					world.ecs.createEntity([new PlayerInputComponent()]);
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

		await fixture.saveAndReload();
		fixture.step(2);
		expect(fixture.ecs.query(DialogueComponent).length).toBe(1);

		const open = dialogueIds(fixture)[0]!;
		fixture.ecs.destroy(open);
		fixture.step(2);
		expect(fixture.ecs.query(SequenceComponent).length).toBe(0);
		fixture.dispose();
	});
});
