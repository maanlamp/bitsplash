import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { type LoadedFont, loadFontFamily } from "../src/engine/load";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import {
	parseRichText,
	type RichLine,
	wrapRichText,
} from "../src/engine/text/rich-text";
import { WHEEL_TOKEN } from "../src/engine/ui/input/masked-input";
import { findById } from "../src/engine/ui/input/node-tree";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";
import { UiRuntime } from "../src/engine/ui/ui-runtime";
import type { RenderContext } from "../src/engine/system";
import Vector2 from "../src/engine/vector2";
import { UNLOADED_BUBBLE_FRAME } from "../src/game/dialogue/bubble-frame";
import { ConversationFocusSystem } from "../src/game/dialogue/conversation-focus-system";
import {
	choiceOptionId,
	CONVERSATION_PANEL_ID,
	messageBubbleId,
	messageRowId,
} from "../src/game/dialogue/conversation-nodes";
import {
	BUBBLE_MAX_TEXT_WIDTH,
	type ChoiceView,
	type MessageView,
} from "../src/game/dialogue/conversation-view";
import { DialogueHud } from "../src/game/dialogue/dialogue-hud";
import { DialogueHudState } from "../src/game/dialogue/dialogue-hud-state";
import { UI_FONT } from "../src/game/dialogue/dialogue-ui";
import { Message } from "../src/game/dialogue/message";
import { commitSync, mountSync } from "./support/ui-fixture";

const VIEWPORT = 640;

const font: LoadedFont = await (async () => {
	const bytes = readFileSync("src/game/content/assets/yoster.ttf");
	const buffer = bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
	return loadFontFamily("yoster", [buffer], 12);
})();

const wrap = (text: string): RichLine[] =>
	wrapRichText(font, parseRichText(text), BUBBLE_MAX_TEXT_WIDTH);

const TEXTS = [
	"Embers do not wink at travellers.",
	"They do, and I have seen it.",
	"Name one, then.",
];

const messageView = (index: number): MessageView => ({
	index,
	message: new Message(
		index % 2 === 0 ? "bramble" : "player",
		TEXTS[index]!,
	),
	lines: wrap(TEXTS[index]!),
	loadedFont: font,
	portrait: null,
	emotionIcon: null,
	bubbleId: messageBubbleId(index),
});

const choiceView = (index: number, selected: number): ChoiceView => ({
	index,
	lines: wrap(index === 0 ? "Gerald." : "I would rather not."),
	font: UI_FONT,
	selected: index === selected,
});

const mouseAt = (
	x: number,
	y: number,
	buttons: Record<string, boolean> = {},
): DeviceSnapshot => ({
	keyboard: { keys: {} },
	mouse: {
		buttons,
		position: new Vector2(x, y),
		wheel: new Vector2(0, 0),
		inside: true,
	},
	gamepads: {},
});

const keysDown = (keys: Record<string, boolean>): DeviceSnapshot => ({
	keyboard: { keys },
	mouse: {
		buttons: {},
		position: new Vector2(-1000, -1000),
		wheel: new Vector2(0, 0),
		inside: false,
	},
	gamepads: {},
});

type Rig = Readonly<{
	ui: UiRuntime;
	store: DialogueHudState;
	focus: ConversationFocusSystem;
	/** Lay out, then run the focus system as a real frame's render pass would. */
	frame: () => void;
	node: (id: string) => UiNode;
	focusedId: () => string | null;
}>;

/** A mounted conversation panel with `choices` options pending below it. */
const rig = (choices: number, selected = 0): Rig => {
	const ui = new UiRuntime({
		resolveFont: () => font,
		font: () => font,
	});
	const store = new DialogueHudState();
	const publish = (count: number, chosen: number): void => {
		store.setSnapshot({
			open: true,
			messages: [0, 1, 2].map(messageView),
			choices: Array.from({ length: count }, (_, index) =>
				choiceView(index, chosen),
			),
			frame: UNLOADED_BUBBLE_FRAME,
			advanceGlyph: "E",
			advanceIcon: null,
			advanceActivation: "press",
			kbdFrame: null,
			kbdInsets: undefined,
			uiFont: UI_FONT,
		});
	};
	publish(choices, selected);
	mountSync(ui, createElement(DialogueHud, { store }));
	const focus = new ConversationFocusSystem(
		ui.root,
		ui.dispatcher,
		store,
	);
	const frame = (): void => {
		store.markInteractive();
		ui.layout(1, VIEWPORT, VIEWPORT);
		focus.render({} as RenderContext);
	};
	frame();
	return {
		ui,
		store,
		focus,
		frame,
		node: (id) => {
			const found = findById(ui.root.tree, id);
			expect(found).not.toBeNull();
			return found!;
		},
		focusedId: () => {
			const focused = ui.dispatcher.focusNav.focused;
			return focused
				? ((focused.props.id as string | undefined) ?? null)
				: null;
		},
	};
};

const move = (r: Rig, direction: "up" | "down"): string | null => {
	r.ui.dispatcher.focusNav.move(r.ui.root.tree, direction);
	return r.focusedId();
};

describe("the conversation's ordered focus chain", () => {
	test("initial focus lands on the first choice, not the oldest bubble", () => {
		const r = rig(2);

		expect(r.ui.dispatcher.focusNav.trap).toBe(
			r.node(CONVERSATION_PANEL_ID),
		);
		expect(r.focusedId()).toBe(choiceOptionId(0));
	});

	test("up from the topmost choice enters history, and walks it row by row", () => {
		const r = rig(2);

		expect(move(r, "up")).toBe(messageRowId(2));
		expect(move(r, "up")).toBe(messageRowId(1));
		expect(move(r, "up")).toBe(messageRowId(0));
	});

	test("down from the newest message re-enters the choices", () => {
		const r = rig(2);
		move(r, "up");
		expect(r.focusedId()).toBe(messageRowId(2));

		expect(move(r, "down")).toBe(choiceOptionId(0));
		expect(move(r, "down")).toBe(choiceOptionId(1));
	});

	test("every link in the chain is declared, not left to geometric scoring", () => {
		const r = rig(2);
		const neighbors = (
			id: string,
		): Record<string, string | undefined> =>
			r.node(id).props.focusNeighbors as Record<
				string,
				string | undefined
			>;

		expect(neighbors(messageRowId(0))).toEqual({
			up: undefined,
			down: messageRowId(1),
		});
		expect(neighbors(messageRowId(2))).toEqual({
			up: messageRowId(1),
			down: choiceOptionId(0),
		});
		expect(neighbors(choiceOptionId(0))).toEqual({
			up: messageRowId(2),
			down: choiceOptionId(1),
		});
		expect(neighbors(choiceOptionId(1))).toEqual({
			up: choiceOptionId(0),
			down: undefined,
		});
	});

	test("with no choices pending, the newest row is the end of the chain", () => {
		const r = rig(0);

		expect(r.focusedId()).toBe(messageRowId(0));
		expect(
			(
				r.node(messageRowId(2)).props.focusNeighbors as Record<
					string,
					string | undefined
				>
			).down,
		).toBeUndefined();
	});

	test("focus re-anchors onto a fresh set of choices, but not onto the same one twice", () => {
		const r = rig(2);
		move(r, "up");
		expect(r.focusedId()).toBe(messageRowId(2));

		r.frame();
		expect(r.focusedId()).toBe(messageRowId(2));
	});

	test("the trap is released when the panel leaves the tree", () => {
		const r = rig(2);
		expect(r.ui.dispatcher.focusNav.trap).not.toBeNull();

		commitSync(r.ui, () => {
			r.store.close();
		});
		r.frame();

		expect(r.ui.dispatcher.focusNav.trap).toBeNull();
	});

	test("the trap is released while the conversation is not being simulated", () => {
		const r = rig(2);
		expect(r.ui.dispatcher.focusNav.trap).not.toBeNull();

		/**
		 * A paused frame: the panel is still mounted behind the pause menu, but the
		 * sync system did not run, so nothing marked the conversation interactive.
		 */
		r.ui.layout(1, VIEWPORT, VIEWPORT);
		r.focus.render({} as RenderContext);

		expect(r.ui.dispatcher.focusNav.trap).toBeNull();
	});
});

describe("W and S are focus keys only inside the trap", () => {
	const focusMoves = (ui: UiRuntime): readonly string[] =>
		ui.dispatcher.events
			.map((entry) => entry.event)
			.filter((event) => event.type === "focusmove")
			.map((event) => (event as { direction: string }).direction);

	test("W moves focus and is taken off the gameplay action layer while trapped", () => {
		const r = rig(2);
		const input = keysDown({ W: true });

		r.ui.dispatcher.dispatch(r.ui.root.tree, input, 1, 1 / 60);

		expect(focusMoves(r.ui)).toEqual(["up"]);
		expect(r.focusedId()).toBe(messageRowId(2));
		expect(r.ui.dispatcher.consumed.has("kbd:W")).toBe(true);
		expect(
			r.ui.dispatcher.maskedInput(input).keyboard.keys.W,
		).toBeUndefined();
	});

	test("W is left alone for gameplay when no trap is up", () => {
		const r = rig(2);
		r.ui.dispatcher.focusNav.clearTrap();
		const input = keysDown({ W: true });

		r.ui.dispatcher.dispatch(r.ui.root.tree, input, 1, 1 / 60);

		expect(focusMoves(r.ui)).toEqual([]);
		expect(r.ui.dispatcher.consumed.has("kbd:W")).toBe(false);
		expect(r.ui.dispatcher.maskedInput(input).keyboard.keys.W).toBe(
			true,
		);
	});

	test("pressing up on the oldest row scrolls the transcript instead of losing focus", () => {
		const r = rig(2);
		const conversation = {
			messages: Array.from({ length: 6 }, () => new Message()),
			cursor: 5,
			slotTweens: [],
		};
		r.store.setConversation(
			conversation as unknown as Parameters<
				DialogueHudState["setConversation"]
			>[0],
		);
		r.ui.dispatcher.focusNav.focus(r.node(messageRowId(0)));

		r.ui.dispatcher.dispatch(
			r.ui.root.tree,
			keysDown({ W: true }),
			1,
			1 / 60,
		);

		expect(conversation.cursor).toBe(4);
		expect(r.focusedId()).toBe(messageRowId(0));
	});
});

describe("the dialogue overlay is pointer-transparent", () => {
	const hoverTokens = (
		r: Rig,
		x: number,
		y: number,
	): ReadonlySet<string> => {
		r.ui.dispatcher.dispatch(
			r.ui.root.tree,
			mouseAt(x, y),
			1,
			1 / 60,
		);
		return r.ui.dispatcher.consumed;
	};

	test("hovering the panel's empty space consumes no mouse token", () => {
		const r = rig(2);

		const consumed = hoverTokens(r, 4, 4);

		expect(consumed.has("mouse:right")).toBe(false);
		expect(consumed.has("mouse:left")).toBe(false);
		expect(consumed.has(WHEEL_TOKEN)).toBe(false);
	});

	test("a choice still takes the mouse, and clicking it confirms", () => {
		const r = rig(2);
		const rect = r.node(choiceOptionId(1)).layoutRect!;
		const x = rect.x + rect.w / 2;
		const y = rect.y + rect.h / 2;

		expect(hoverTokens(r, x, y).has("mouse:left")).toBe(true);

		const clicked: { index: number | null } = { index: null };
		r.store.confirm = (index: number): void => {
			clicked.index = index;
		};
		r.ui.dispatcher.dispatch(
			r.ui.root.tree,
			mouseAt(x, y, { left: true }),
			1,
			1 / 60,
		);
		r.ui.dispatcher.dispatch(
			r.ui.root.tree,
			mouseAt(x, y),
			1,
			1 / 60,
		);

		expect(clicked.index).toBe(1);
	});
});
