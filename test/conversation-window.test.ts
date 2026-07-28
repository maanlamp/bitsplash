import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Camera2D } from "../src/engine/camera/camera-2d";
import { Camera2DComponent } from "../src/engine/camera/camera-2d-component";
import { Camera2DFollowComponent } from "../src/engine/camera/camera-2d-follow-component";
import { Camera2DFollowSystem } from "../src/engine/camera/camera-2d-follow-system";
import { CameraTransitionSystem } from "../src/engine/camera/camera-transition-system";
import { DialogueComponent } from "../src/engine/dialogue/dialogue-component";
import {
	type DialogueBindings,
	DialogueSystem,
} from "../src/engine/dialogue/dialogue-system";
import type { Milliseconds } from "../src/engine/duration";
import { LastUsedDevice } from "../src/engine/input/last-used-device";
import { NULL_ACTIONS } from "../src/engine/input/bindings/action-provider";
import { SequenceComponent } from "../src/engine/sequence/sequence-component";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { Tween } from "../src/engine/animation/tween";
import {
	CONVERSATION_SLOTS,
	ConversationComponent,
} from "../src/game/dialogue/conversation-component";
import { ConversationPops } from "../src/game/dialogue/conversation-pops";
import {
	conversationWindow,
	hasOlder,
} from "../src/game/dialogue/conversation-window";
import { Message } from "../src/game/dialogue/message";
import { platformerDialogueBindings } from "../src/game/dialogue/dialogue-bindings";
import { DialogueHudState } from "../src/game/dialogue/dialogue-hud-state";
import { DialogueHudSyncSystem } from "../src/game/dialogue/dialogue-hud-sync-system";
import { DialogueSourceComponent } from "../src/game/dialogue/dialogue-source-component";
import {
	CARTRIDGE_FONT,
	COMICORO_FONT,
	DEFAULT_FONT,
} from "../src/game/dialogue/ink-fonts";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
import { campfireStargazerSequence } from "../src/game/sequence/campfire-stargazer-sequence";
import {
	boundInkStoryComponent,
	gameSequenceSceneConfig,
	rehydrateInkStory,
} from "./support/game-sequence-scene";
import {
	SequenceFixture,
	settleAssets,
	useDiskFetch,
} from "./support/sequence-harness";
import { snapshot } from "./support/ui-fixture";

const GAMEPLAY_ZOOM = 3;
const FRAME_BUDGET = 1200;

/** Long enough for any pop tween to finish in one tick. */
const FULL_POP_MS = 1000 as Milliseconds;

/**
 * The shipped campfire conversation, compiled from the authored file rather than
 * an inlined copy, so the window is exercised against the real speaker tags and
 * the real line lengths.
 */
const CAMPFIRE_INK = [
	"EXTERNAL start_cutscene(id)",
	"-> END",
	"",
	readFileSync("src/game/content/dialogue/campfire.ink", "utf8"),
].join("\n");

/** Advance only on the frames the test asks for, so messages can be inspected. */
const gatedBindings = (
	press: Readonly<{ value: boolean }>,
): DialogueBindings => ({
	...platformerDialogueBindings,
	advancePressed: () => press.value,
	consumeAdvance: () => {},
});

type Rig = Readonly<{
	fixture: SequenceFixture;
	hud: DialogueHudState;
	press: { value: boolean };
	restoreFetch: () => void;
}>;

const startCampfire = async (): Promise<Rig> => {
	const restoreFetch = useDiskFetch();
	const press = { value: false };
	const hud = new DialogueHudState();
	const fixture = await SequenceFixture.create({
		...gameSequenceSceneConfig({
			def: campfireStargazerSequence,
			seedScene: (world) => {
				world.ecs.createEntity([
					boundInkStoryComponent(world, CAMPFIRE_INK),
				]);
				const player = world.ecs.createEntity([
					new PlayerInputComponent(),
					new TransformComponent(),
				]);
				world.ecs.createEntity([
					new DialogueSourceComponent("campfire.companion"),
					new TransformComponent(new Vector2(64, 0)),
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
			preSystems: (world) => {
				world.ecs.addUpdateSystem(
					new DialogueSystem(gatedBindings(press)),
				);
			},
			extraSystems: (world) => {
				world.ecs.addUpdateSystem(new Camera2DFollowSystem());
				world.ecs.addUpdateSystem(new CameraTransitionSystem());
				world.ecs.addUpdateSystem(
					new DialogueHudSyncSystem(hud, new LastUsedDevice()),
				);
			},
		}),
		input: snapshot(),
		actions: NULL_ACTIONS,
	});

	for (const font of [DEFAULT_FONT, CARTRIDGE_FONT, COMICORO_FONT]) {
		fixture.assetManager.getFontFamilies(
			font.fontRef.path,
			font.size,
		);
	}
	await settleAssets();
	return { fixture, hud, press, restoreFetch };
};

const conversationOf = (
	fixture: SequenceFixture,
): ConversationComponent =>
	fixture.ecs.query(ConversationComponent)[0]![1];

/** Hold advance for one frame, then release, which is one press. */
const pressAdvance = (rig: Rig): void => {
	rig.press.value = true;
	rig.fixture.step(1);
	rig.press.value = false;
	rig.fixture.step(1);
};

/** Run until the transcript holds `count` messages, or give up. */
const growTranscript = (rig: Rig, count: number): void => {
	let frames = 0;
	while (frames < FRAME_BUDGET) {
		const conversation = rig.fixture.ecs.query(
			ConversationComponent,
		)[0]?.[1];
		if (conversation && conversation.messages.length >= count) {
			return;
		}
		pressAdvance(rig);
		frames += 2;
	}
	throw new Error(
		`campfire never reached ${count} messages within ${FRAME_BUDGET} frames`,
	);
};

describe("conversationWindow", () => {
	test("shows the cursor and up to two messages before it, never past it", () => {
		expect(conversationWindow(5, 9)).toEqual([3, 4, 5]);
		expect(conversationWindow(1, 9)).toEqual([0, 1]);
		expect(conversationWindow(0, 9)).toEqual([0]);
		expect(conversationWindow(0, 0)).toEqual([]);
		expect(conversationWindow(9, 3)).toEqual([0, 1, 2]);
		expect(conversationWindow(5, 9)).toHaveLength(CONVERSATION_SLOTS);
	});

	test("hasOlder is false once the window's oldest row is the first message", () => {
		const conversation = new ConversationComponent(
			CONVERSATION_SLOTS,
		);
		conversation.messages.length = 6;
		conversation.cursor = 5;
		expect(hasOlder(conversation)).toBe(true);
		conversation.cursor = 2;
		expect(hasOlder(conversation)).toBe(false);
	});
});

describe("ConversationPops", () => {
	const transcript = (count: number, cursor: number) => {
		const conversation = new ConversationComponent(
			CONVERSATION_SLOTS,
		);
		for (let i = 0; i < count; i++) {
			conversation.messages.push(new Message("player", `line ${i}`));
		}
		conversation.cursor = cursor;
		return conversation;
	};

	test("only the slot an unseen message lands in restarts its tween", () => {
		const conversation = transcript(3, 2);
		const pops = new ConversationPops();
		pops.step(conversation, FULL_POP_MS);
		for (const tween of conversation.slotTweens) {
			expect(tween.done()).toBe(true);
		}

		conversation.messages.push(new Message("player", "line 3"));
		conversation.cursor = 3;
		pops.step(conversation, 1 as Milliseconds);

		expect(conversation.slotTweens[0]!.done()).toBe(true);
		expect(conversation.slotTweens[1]!.done()).toBe(true);
		expect(conversation.slotTweens[2]!.done()).toBe(false);
	});

	test("a window restored mid-conversation is adopted at rest, pops unplayed", () => {
		const conversation = transcript(4, 3);
		for (const tween of conversation.slotTweens) {
			tween.tick(FULL_POP_MS);
		}

		new ConversationPops().step(conversation, 1 as Milliseconds);

		for (const tween of conversation.slotTweens) {
			expect(tween.done()).toBe(true);
		}
	});

	test("a fresh conversation pops its first bubble in", () => {
		const conversation = transcript(1, 0);

		new ConversationPops().step(conversation, 1 as Milliseconds);

		expect(conversation.slotTweens[0]!.done()).toBe(false);
		expect(conversation.slotTweens[0]!.value()).toBeLessThan(1);
	});
});

describe("the campfire window and its cursor", () => {
	test("the cursor walks back to the first message and forward again, surviving capture -> restore", async () => {
		const rig = await startCampfire();
		growTranscript(rig, CONVERSATION_SLOTS * 2);

		const grown = conversationOf(rig.fixture);
		const transcript = grown.messages.map((message) => message.text);
		const newest = grown.messages.length - 1;
		expect(grown.cursor).toBe(newest);
		expect(hasOlder(grown)).toBe(true);
		expect(
			conversationWindow(grown.cursor, grown.messages.length),
		).toHaveLength(CONVERSATION_SLOTS);
		expect(grown.slotTweens).toHaveLength(CONVERSATION_SLOTS);
		for (const tween of grown.slotTweens) {
			expect(tween.elapsed as number).toBeGreaterThan(0);
		}

		let steps = 0;
		while (steps < FRAME_BUDGET && rig.hud.readBack()) {
			steps++;
			rig.fixture.step(1);
		}
		const rewound = conversationOf(rig.fixture);
		expect(steps).toBe(newest - (CONVERSATION_SLOTS - 1));
		expect(rewound.cursor).toBe(CONVERSATION_SLOTS - 1);
		expect(
			conversationWindow(rewound.cursor, rewound.messages.length)[0],
		).toBe(0);
		const rewoundElapsed = rewound.slotTweens.map(
			(tween) => tween.elapsed as number,
		);

		await rig.fixture.saveAndReload();
		rehydrateInkStory(rig.fixture.ecs, CAMPFIRE_INK);

		const restored = conversationOf(rig.fixture);
		expect(restored).toBeInstanceOf(ConversationComponent);
		expect(restored.messages.map((message) => message.text)).toEqual(
			transcript,
		);
		expect(restored.cursor).toBe(CONVERSATION_SLOTS - 1);
		expect(restored.slotTweens).toHaveLength(CONVERSATION_SLOTS);
		expect(restored.slotTweens[0]).toBeInstanceOf(Tween);
		expect(
			restored.slotTweens.map((tween) => tween.elapsed as number),
		).toEqual(rewoundElapsed);

		rig.hud.setConversation(restored);
		rig.hud.setComponent(
			rig.fixture.ecs.query(DialogueComponent)[0]![1],
		);
		expect(rig.hud.readBack()).toBe(false);

		let forward = 0;
		while (
			conversationOf(rig.fixture).cursor < newest &&
			rig.fixture.ecs.query(SequenceComponent).length > 0 &&
			forward < FRAME_BUDGET
		) {
			pressAdvance(rig);
			forward += 2;
		}
		expect(conversationOf(rig.fixture).cursor).toBe(newest);
		expect(
			conversationOf(rig.fixture).messages.map(
				(message) => message.text,
			),
		).toEqual(transcript);

		rig.fixture.dispose();
		rig.restoreFetch();
	});

	test("a restored conversation does not replay its pops, while a fresh one does", async () => {
		const rig = await startCampfire();
		growTranscript(rig, 2);

		const conversation = conversationOf(rig.fixture);
		const before = conversation.slotTweens.map((tween) =>
			tween.done(),
		);
		expect(before.every(Boolean)).toBe(true);

		await rig.fixture.saveAndReload();
		rig.fixture.step(1);

		for (const tween of conversationOf(rig.fixture).slotTweens) {
			expect(tween.done()).toBe(true);
		}

		rig.fixture.dispose();
		rig.restoreFetch();
	});
});
