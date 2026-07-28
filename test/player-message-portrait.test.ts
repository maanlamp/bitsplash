import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "bun:test";
import type { Story } from "inkjs/full";
import { createElement } from "react";
import type AssetManager from "../src/engine/assets";
import { ECS } from "../src/engine/ecs";
import { compileStory } from "../src/engine/ink/story";
import type { LoadedFont } from "../src/engine/load";
import type { TileSource } from "../src/engine/render/renderer-2d";
import { SpriteAsset } from "../src/engine/sprite/sprite-asset";
import type { UpdateContext } from "../src/engine/system";
import { findById } from "../src/engine/ui/input/node-tree";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";
import { UiRuntime } from "../src/engine/ui/ui-runtime";
import {
	characterById,
	PORTRAIT_SHEET_URL,
} from "../src/game/character/character-descriptor";
import { UNLOADED_BUBBLE_FRAME } from "../src/game/dialogue/bubble-frame";
import { ConversationComponent } from "../src/game/dialogue/conversation-component";
import { ConversationPanel } from "../src/game/dialogue/conversation-panel";
import { ConversationWraps } from "../src/game/dialogue/conversation-wraps";
import {
	conversationFor,
	dialogueHandoff,
	presentDialogue,
} from "../src/game/dialogue/dialogue-handoff";
import { DEFAULT_FONT } from "../src/game/dialogue/ink-fonts";
import { Message } from "../src/game/dialogue/message";
import { realFont } from "./support/real-fonts";
import { mountSync } from "./support/ui-fixture";

const INK_DIR = fileURLToPath(
	new URL("../src/game/content/dialogue/", import.meta.url),
);

const EXTERNALS = [
	"start_quest",
	"advance_quest",
	"decline_quest",
	"give_item",
	"start_cutscene",
] as const;

const shippedStory = (): Story => {
	const sources: Record<string, string> = {};
	for (const file of readdirSync(INK_DIR)) {
		if (file.endsWith(".ink")) {
			sources[file] = readFileSync(`${INK_DIR}${file}`, "utf8");
		}
	}
	const story = compileStory(sources, "main.ink");
	for (const name of EXTERNALS) {
		story.BindExternalFunctionGeneral(name, () => 0, false);
	}
	return story;
};

/** Every knot in the shipped ink that carries a `# speaker: player` line. */
const PLAYER_SPOKEN_KNOTS = [
	"campfire.reply",
	"campfire.wish",
	"campfire.quiet",
	"ambush.debrief",
	"pickup_tutor.pt_smooch",
] as const;

type Session = Readonly<{
	ecs: ECS;
	conversation: ConversationComponent;
	story: Story;
	state: ReturnType<typeof dialogueHandoff>["state"];
}>;

/** Open a knot the way a `dialogue` op does, on its own sequence entity. */
const open = (knot: string): Session => {
	const ecs = new ECS();
	const sequence = ecs.createEntity([]);
	const story = shippedStory();
	story.ChoosePathString(knot);
	const { state } = dialogueHandoff({
		ecs,
		story,
		sequence,
		source: null,
		font: DEFAULT_FONT,
		resumed: null,
	});
	return {
		ecs,
		conversation: conversationFor(ecs, sequence),
		story,
		state,
	};
};

const kinds = (
	conversation: ConversationComponent,
): ReadonlyArray<string> =>
	conversation.messages.map(
		(message) => `${message.characterId}/${message.kind}`,
	);

test("every authored player-spoken line reaches the transcript as speech, not narration", () => {
	for (const knot of PLAYER_SPOKEN_KNOTS) {
		const { conversation } = open(knot);

		expect({ knot, kinds: kinds(conversation) }).toEqual({
			knot,
			kinds: ["player/speech"],
		});
	}
});

test("an unbracketed choice's echo is recorded as the player speaking it", () => {
	const session = open("checkpoint.demand");
	expect(session.state.choices).toHaveLength(2);

	session.story.ChooseChoiceIndex(0);
	presentDialogue(
		{ ecs: session.ecs } as unknown as UpdateContext,
		session.state,
		session.story,
	);

	expect(kinds(session.conversation)).toEqual([
		"pennywhistle/speech",
		"player/speech",
	]);
});

test("a bracketed choice leaves a narration record even though ink suppresses it", () => {
	const session = open("quest_giver");
	expect(session.state.choices).toContain("Accept");

	session.story.ChooseChoiceIndex(
		session.state.choices.indexOf("Accept"),
	);
	session.state.selectedOption =
		session.state.choices.indexOf("Accept");
	presentDialogue(
		{ ecs: session.ecs } as unknown as UpdateContext,
		session.state,
		session.story,
	);

	expect(kinds(session.conversation)).toEqual([
		"stranger/speech",
		"player/narration",
		"stranger/speech",
	]);
});

const sheet = (w: number, h: number): TileSource =>
	({ naturalWidth: w, naturalHeight: h }) as unknown as TileSource;

/** The committed `player.bsprite`, composed as a horizontal strip of its frames. */
const playerSheet = await SpriteAsset.loadBsprite(
	PORTRAIT_SHEET_URL,
	new Uint8Array(
		readFileSync("src/game/content/assets/player.bsprite"),
	),
	async (_entries, manifest) =>
		sheet(manifest.width * manifest.frames.length, manifest.height),
);

const assetsWith = (font: LoadedFont): AssetManager =>
	({
		sprites: {
			get: (url: string) =>
				url === PORTRAIT_SHEET_URL ? playerSheet : undefined,
		},
		getFontFamilies: () => [font],
		getImage: () => undefined,
	}) as unknown as AssetManager;

/** Every `image` node the panel mounted, in render order. */
const imagesIn = (ui: UiRuntime): readonly UiNode[] => {
	const out: UiNode[] = [];
	const walk = (node: UiNode): void => {
		if (node.type === "image") {
			out.push(node);
		}
		for (const child of node.children) {
			walk(child);
		}
	};
	walk(findById(ui.root.tree, "panel") as UiNode);
	return out;
};

const mountPanel = (
	message: Message,
	font: LoadedFont,
): UiRuntime => {
	const conversation = new ConversationComponent(3);
	conversation.messages.push(message);
	const views = new ConversationWraps().messageViews(
		conversation,
		assetsWith(font),
		0,
	);
	expect(views).toHaveLength(1);
	const ui = new UiRuntime({
		resolveFont: () => font,
		font: () => font,
	});
	mountSync(
		ui,
		createElement(ConversationPanel, {
			id: "panel",
			messages: views,
			choices: [],
			frame: UNLOADED_BUBBLE_FRAME,
		}),
	);
	ui.layout(1, 640, 640);
	return ui;
};

test("a player-spoken row mounts the portrait crop from the sheet's portrait frame", async () => {
	const settings = characterById("player").font;
	const font = await realFont(settings);
	const manifest = playerSheet.spriteManifest!;
	const tag = manifest.tags.find(
		(entry) => entry.name === "portrait",
	)!;
	const rect = manifest.contentRects!.portrait!;

	const ui = mountPanel(
		new Message(
			"player",
			"Embers don't wink, Bramble.",
			null,
			"speech",
		),
		font,
	);
	const portraits = imagesIn(ui);

	expect(portraits).toHaveLength(1);
	expect({
		srcX: portraits[0]!.props.srcX,
		srcY: portraits[0]!.props.srcY,
		srcW: portraits[0]!.props.srcW,
		srcH: portraits[0]!.props.srcH,
		flipX: portraits[0]!.props.flipX,
	}).toEqual({
		srcX: tag.from * manifest.width + rect.x,
		srcY: rect.y,
		srcW: rect.width,
		srcH: rect.height,
		flipX: true,
	});
	expect(portraits[0]!.layoutRect?.w).toBeGreaterThan(0);
	expect(portraits[0]!.layoutRect?.h).toBeGreaterThan(0);
});

test("a narration row deliberately mounts no portrait", async () => {
	const font = await realFont(characterById("player").font);

	const ui = mountPanel(
		new Message("player", "You refuse.", null, "narration"),
		font,
	);

	expect(imagesIn(ui)).toHaveLength(0);
});
