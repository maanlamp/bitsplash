import { describe, expect, test } from "bun:test";
import { Tween } from "../src/engine/animation/tween";
import type { Milliseconds } from "../src/engine/duration";
import type { EntityId } from "../src/engine/ecs";
import { SequenceComponent } from "../src/engine/sequence/sequence-component";
import type { SequenceDef } from "../src/engine/sequence/sequence-def";
import { registerSequenceDef } from "../src/engine/sequence/sequence-system";
import { ConversationComponent } from "../src/game/dialogue/conversation-component";
import { Message } from "../src/game/dialogue/message";
import { gameSequenceSceneConfig } from "./support/game-sequence-scene";
import { SequenceFixture } from "./support/sequence-harness";
import { TEST_OP, testOp } from "./support/sequence-scene";

const holdDef = (
	id: string,
	sequenceClass: SequenceDef["class"] = "exclusive",
): SequenceDef => ({
	id,
	class: sequenceClass,
	cast: {},
	root: testOp(TEST_OP.hold, `${id}.hold`, {
		frames: 3,
		counter: id,
	}),
});

const FIRST = holdDef("conversation-first");
const SECOND = holdDef("conversation-second");
const AMBIENT = holdDef("conversation-ambient", "ambient");

const transcript = (): ConversationComponent => {
	const conversation = new ConversationComponent(2);
	conversation.messages.push(
		new Message("bramble", "Embers don't wink.", "happy", "speech"),
		new Message(
			"player",
			"You slide a fat purse across the plank.",
			null,
			"narration",
		),
	);
	conversation.cursor = 1;
	conversation.slotTweens[0]!.tick(120 as Milliseconds);
	return conversation;
};

const conversationEntry = (
	fixture: SequenceFixture,
): readonly [EntityId, ConversationComponent] | undefined =>
	fixture.ecs.query(ConversationComponent)[0];

const startFixture = async (
	queued: readonly string[],
): Promise<SequenceFixture> => {
	registerSequenceDef(SECOND);
	registerSequenceDef(AMBIENT);
	const fixture = await SequenceFixture.create(
		gameSequenceSceneConfig({
			def: FIRST,
			seedSequence: (component) => {
				component.queue.push(...queued);
			},
		}),
	);
	const [sequenceId] = fixture.ecs.query(SequenceComponent)[0]!;
	fixture.ecs.addComponent(sequenceId, transcript());
	return fixture;
};

describe("ConversationComponent lifecycle on the exclusive sequence entity", () => {
	test("the transcript survives capture -> fresh runtime -> restore", async () => {
		const fixture = await startFixture([SECOND.id]);
		fixture.step(1);

		const before = conversationEntry(fixture)![1];
		expect(before.messages).toHaveLength(2);
		expect(before.slotTweens[0]!.elapsed as number).toBeCloseTo(
			0.12,
			6,
		);

		await fixture.saveAndReload();

		const after = conversationEntry(fixture)![1];
		expect(after).toBeInstanceOf(ConversationComponent);
		expect(after.cursor).toBe(1);
		expect(after.messages.map((m) => m.characterId)).toEqual([
			"bramble",
			"player",
		]);
		expect(after.messages[0]).toBeInstanceOf(Message);
		expect(after.messages[0]!.emotion).toBe("happy");
		expect(after.messages[0]!.kind).toBe("speech");
		expect(after.messages[1]!.emotion).toBeNull();
		expect(after.messages[1]!.kind).toBe("narration");
		expect(after.messages[1]!.text).toBe(
			"You slide a fat purse across the plank.",
		);
		expect(after.slotTweens).toHaveLength(2);
		expect(after.slotTweens[0]).toBeInstanceOf(Tween);
		expect(after.slotTweens[0]!.elapsed as number).toBeCloseTo(
			0.12,
			6,
		);
		expect(after.slotTweens[1]!.elapsed as number).toBe(0);

		fixture.dispose();
	});

	test("the transcript survives SequenceSystem.finish reusing the entity for a queued sequence", async () => {
		const fixture = await startFixture([SECOND.id]);
		const [entityBefore] = conversationEntry(fixture)!;

		fixture.step(3);

		const sequence = fixture.ecs.query(SequenceComponent)[0]!;
		expect(sequence[1].defId).toBe(SECOND.id);
		expect(sequence[0]).toBe(entityBefore);

		const entry = conversationEntry(fixture)!;
		expect(entry[0]).toBe(entityBefore);
		expect(entry[1].messages).toHaveLength(2);

		fixture.dispose();
	});

	test("the transcript dies with the chain", async () => {
		const fixture = await startFixture([SECOND.id]);
		fixture.step(30);

		expect(fixture.ecs.query(SequenceComponent)).toHaveLength(0);
		expect(fixture.ecs.query(ConversationComponent)).toHaveLength(0);

		fixture.dispose();
	});

	test("queueing a non-exclusive def behind an exclusive one crashes loudly", async () => {
		const fixture = await startFixture([AMBIENT.id]);

		expect(() => {
			fixture.step(10);
		}).toThrow(/conversation-ambient/);

		fixture.dispose();
	});
});
