import { expect, test } from "bun:test";
import { createElement } from "react";
import { DialogueComponent } from "../src/engine/dialogue/dialogue-component";
import type { Milliseconds } from "../src/engine/duration";
import { ECS } from "../src/engine/ecs";
import type { RenderContext } from "../src/engine/system";
import { findById } from "../src/engine/ui/input/node-tree";
import {
	GlyphText,
	View,
} from "../src/engine/ui/reconciler/ui-elements";
import {
	CONVERSATION_SLOTS,
	ConversationComponent,
} from "../src/game/dialogue/conversation-component";
import {
	messageGlyphsId,
	messageRowId,
} from "../src/game/dialogue/conversation-nodes";
import { DialogueHudDynSystem } from "../src/game/dialogue/dialogue-hud-dyn-system";
import { Message } from "../src/game/dialogue/message";
import { headlessUi, mountSync } from "./support/ui-fixture";
import type { UiRuntime } from "../src/engine/ui/ui-runtime";

const REVEALED = 5.7;

/** More glyphs than {@link REVEALED} covers, as a skipped message would have. */
const TOTAL_GLYPHS = 42;

const transcript = (count: number, cursor: number): ECS => {
	const ecs = new ECS();
	const conversation = new ConversationComponent();
	for (let i = 0; i < count; i++) {
		conversation.messages.push(new Message("player", `line ${i}`));
	}
	conversation.cursor = cursor;
	ecs.createEntity([conversation]);
	const state = new DialogueComponent();
	state.revealed = REVEALED;
	ecs.createEntity([state]);
	return ecs;
};

/** Two glyph nodes, one per transcript message, as the window would mount. */
const mountGlyphs = (): UiRuntime => {
	const ui = headlessUi();
	mountSync(
		ui,
		createElement(View, {
			children: [0, 1].map((index) =>
				createElement(GlyphText, {
					key: index,
					id: messageGlyphsId(index),
					glyphs: [],
				}),
			),
		}),
	);
	return ui;
};

test("only the presented message's glyph node gets a reveal entry", () => {
	const ui = mountGlyphs();
	const retained = findById(ui.root.tree, messageGlyphsId(0))!;
	const presented = findById(ui.root.tree, messageGlyphsId(1))!;

	new DialogueHudDynSystem(ui.root, ui.dyn).render({
		ecs: transcript(2, 1),
	} as unknown as RenderContext);

	expect(ui.dyn.get(presented.id)?.reveal).toBe(Math.floor(REVEALED));
	expect(ui.dyn.get(retained.id)?.reveal).toBeUndefined();
	expect(ui.dyn.reveal(retained)).toBe(Number.POSITIVE_INFINITY);
});

test("a cursor left behind by a multi-block gather reveals the message it is on, not the newest", () => {
	const ui = mountGlyphs();
	const presented = findById(ui.root.tree, messageGlyphsId(0))!;
	const unread = findById(ui.root.tree, messageGlyphsId(1))!;

	new DialogueHudDynSystem(ui.root, ui.dyn).render({
		ecs: transcript(2, 0),
	} as unknown as RenderContext);

	expect(ui.dyn.get(presented.id)?.reveal).toBe(Math.floor(REVEALED));
	expect(ui.dyn.get(unread.id)?.reveal).toBeUndefined();
});

test("a message completed part-way through its reveal paints in full", () => {
	const ui = mountGlyphs();
	const presented = findById(ui.root.tree, messageGlyphsId(1))!;
	const system = new DialogueHudDynSystem(ui.root, ui.dyn);
	const ecs = transcript(2, 1);
	const state = ecs.query(DialogueComponent)[0]![1];

	system.render({ ecs } as unknown as RenderContext);
	expect(ui.dyn.reveal(presented)).toBe(Math.floor(REVEALED));

	state.revealed = TOTAL_GLYPHS;
	state.complete = true;
	system.render({ ecs } as unknown as RenderContext);

	expect(ui.dyn.reveal(presented)).toBeGreaterThanOrEqual(
		TOTAL_GLYPHS,
	);
});

/** Row nodes for the three messages a full window shows. */
const mountRows = (): UiRuntime => {
	const ui = headlessUi();
	mountSync(
		ui,
		createElement(View, {
			children: [0, 1, 2].map((index) =>
				createElement(View, {
					key: index,
					id: messageRowId(index),
				}),
			),
		}),
	);
	return ui;
};

test("only the newest row pops; the rows behind it are pinned at rest", () => {
	const ui = mountRows();
	const ecs = new ECS();
	const conversation = new ConversationComponent(CONVERSATION_SLOTS);
	for (let i = 0; i < 3; i++) {
		conversation.messages.push(new Message("player", `line ${i}`));
	}
	conversation.cursor = 2;
	ecs.createEntity([conversation]);
	ecs.createEntity([new DialogueComponent()]);

	// Mid-pop on the arriving slot, and every other slot left untouched at 0 —
	// the state that used to make the whole conversation fade and shift.
	conversation.slotTweens[2]!.retarget(0, 1, 0.18, "easeOutBack");
	conversation.slotTweens[2]!.tick(30 as Milliseconds);

	new DialogueHudDynSystem(ui.root, ui.dyn).render({
		ecs,
	} as unknown as RenderContext);

	for (const index of [0, 1]) {
		const row = findById(ui.root.tree, messageRowId(index))!;
		expect(ui.dyn.get(row.id)?.alpha).toBe(1);
		expect(ui.dyn.get(row.id)?.offsetY).toBe(0);
	}

	const newest = findById(ui.root.tree, messageRowId(2))!;
	expect(ui.dyn.get(newest.id)?.alpha).toBeLessThan(1);
	expect(ui.dyn.get(newest.id)?.offsetY).not.toBe(0);
});
