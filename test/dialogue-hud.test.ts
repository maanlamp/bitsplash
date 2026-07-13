import { beforeAll, expect, test } from "bun:test";
import { createElement } from "react";
import { ECS } from "../src/engine/ecs";
import { DialogueComponent } from "../src/engine/dialogue/dialogue-component";
import {
	type DialogueBindings,
	DialogueSystem,
} from "../src/engine/dialogue/dialogue-system";
import EventBus from "../src/engine/events";
import { InkStoryComponent } from "../src/engine/ink/ink-story-component";
import { LastUsedDevice } from "../src/engine/input/last-used-device";
import { compileStory } from "../src/engine/ink/story";
import type { UpdateContext } from "../src/engine/system";
import { DynStore } from "../src/engine/ui/bypass/dyn-store";
import { UiEventDispatcher } from "../src/engine/ui/input/event-dispatcher";
import {
	findById,
	isFocusable,
} from "../src/engine/ui/input/node-tree";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";
import { UiRoot } from "../src/engine/ui/reconciler/ui-root";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import {
	DIALOGUE_GLYPHS_ID,
	DialogueHud,
} from "../src/game/dialogue/dialogue-hud";
import { DialogueHudDynSystem } from "../src/game/dialogue/dialogue-hud-dyn-system";
import { DialogueHudState } from "../src/game/dialogue/dialogue-hud-state";
import { DialogueHudSyncSystem } from "../src/game/dialogue/dialogue-hud-sync-system";

beforeAll(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = false;
});

const bindings: DialogueBindings = {
	textWidth: 200,
	maxLines: 3,
	charactersPerSecond: 30,
	commaPauseChars: 0,
	midPauseChars: 0,
	stopPauseChars: 0,
	ellipsisPauseChars: 0,
	slideIn: 0 as never,
	slideOut: 0 as never,
	advancePressed: () => false,
	consumeAdvance: () => {},
	navUpHeld: () => false,
	navDownHeld: () => false,
};

const assetManager = {
	getFontFamilies: () => null,
	getImage: () => undefined,
	getImageMetadata: () => null,
} as never;

const rest: DeviceSnapshot = {
	keyboard: { keys: {} },
	mouse: {
		buttons: {},
		position: { x: -1, y: -1 },
		wheel: { x: 0, y: 0 },
	},
	gamepads: {},
};
const withEnter: DeviceSnapshot = {
	...rest,
	keyboard: { keys: { ENTER: true } },
};

const emptyExpansion = {
	bindings: [],
	byAction: new Map(),
	danglingRefs: [],
	droppedEdges: [],
	invalidChordTokens: [],
};

const ctxFor = (ecs: ECS, events: EventBus): UpdateContext =>
	({
		dt: 16,
		ecs,
		events,
		assetManager,
		actions: { getExpansion: () => emptyExpansion },
		input: rest,
	}) as unknown as UpdateContext;

const choiceNodes = (root: UiNode): UiNode[] => {
	const out: UiNode[] = [];
	const walk = (node: UiNode): void => {
		if (
			isFocusable(node) &&
			node.props.focusGroup === "dialogue-choices"
		) {
			out.push(node);
		}
		for (const child of node.children) {
			walk(child);
		}
	};
	walk(root);
	return out;
};

test("dialogue: open → choices shown → focus+confirm a choice → advance → close", () => {
	const ecs = new ECS();
	const events = new EventBus();
	const dialogueSystem = new DialogueSystem(bindings);
	const hud = new DialogueHudState();
	const sync = new DialogueHudSyncSystem(hud, new LastUsedDevice());

	const ink = new InkStoryComponent();
	ink.story = compileStory(
		{
			"main.ink":
				"* [Yes] -> yes\n* [No] -> no\n=== yes ===\n-> END\n=== no ===\n-> END\n",
		},
		"main.ink",
	);
	ecs.createEntity([ink]);
	const dialogueId = ecs.createEntity([new DialogueComponent(null)]);
	const state = ecs.getComponent(dialogueId, DialogueComponent)!;

	const stages = {
		opened: false,
		choicesShown: false,
		confirmed: false,
		closing: false,
		closed: false,
	};

	// Open + reveal + present choices.
	dialogueSystem.update(ctxFor(ecs, events));
	stages.opened = ecs.query(DialogueComponent).length > 0;
	sync.update(ctxFor(ecs, events));
	stages.choicesShown = hud.getSnapshot().choices.length === 2;

	// Mount the dialogue HUD through the real reconciler + dispatcher.
	const root = new UiRoot();
	const dispatcher = new UiEventDispatcher();
	root.flushSyncFromReconciler(() =>
		root.mount(createElement(DialogueHud, { store: hud })),
	);

	// Focus the second choice and confirm it (keyboard ENTER path).
	const choices = choiceNodes(root.tree);
	expect(choices).toHaveLength(2);
	dispatcher.focusNav.focus(choices[1]!);
	dispatcher.dispatch(root.tree, rest, 1, 0.016);
	dispatcher.dispatch(root.tree, withEnter, 1, 0.016);

	expect(state.selectedOption).toBe(1);
	stages.confirmed = state.pendingConfirm === true;

	// The dialogue system consumes the UI confirm and advances/closes.
	dialogueSystem.update(ctxFor(ecs, events));
	stages.closing = state.phase === "closing";

	dialogueSystem.update(ctxFor(ecs, events));
	ecs.flushDestroyed();
	stages.closed = ecs.query(DialogueComponent).length === 0;

	expect(stages).toEqual({
		opened: true,
		choicesShown: true,
		confirmed: true,
		closing: true,
		closed: true,
	});
});

const findText = (node: UiNode, text: string): UiNode | null => {
	if (node.type === "text" && node.props.children === text) {
		return node;
	}
	for (const child of node.children) {
		const found = findText(child, text);
		if (found) {
			return found;
		}
	}
	return null;
};

const parentOf = (root: UiNode, target: UiNode): UiNode | null => {
	for (const child of root.children) {
		if (child === target) {
			return root;
		}
		const found = parentOf(child, target);
		if (found) {
			return found;
		}
	}
	return null;
};

test("dialogue: next-page hint renders as a normal-flow key-cap, not '...'", () => {
	const ecs = new ECS();
	const events = new EventBus();

	const dialogue = new DialogueComponent(null);
	dialogue.pages = [[], []];
	dialogue.pageIndex = 0;
	dialogue.complete = true;
	dialogue.paginated = true;
	ecs.createEntity([dialogue]);

	const hud = new DialogueHudState();
	new DialogueHudSyncSystem(hud, new LastUsedDevice()).update(
		ctxFor(ecs, events),
	);
	expect(hud.getSnapshot().more).toBe(true);
	expect(hud.getSnapshot().advanceGlyph).toBe("E");

	const root = new UiRoot();
	root.flushSyncFromReconciler(() =>
		root.mount(createElement(DialogueHud, { store: hud })),
	);

	const glyph = findText(root.tree, "E");
	expect(glyph).not.toBeNull();
	expect(findText(root.tree, "...")).toBeNull();

	const cap = parentOf(root.tree, glyph!)!;
	const footer = parentOf(root.tree, cap)!;
	const footerStyle = footer.props.style as
		| { position?: string; justifyContent?: string }
		| undefined;
	expect(footerStyle?.position).not.toBe("absolute");
	expect(footerStyle?.justifyContent).toBe("flex-end");
});

test("dialogue dyn system writes glyph reveal for the open page", () => {
	const ecs = new ECS();
	const events = new EventBus();
	const dialogueSystem = new DialogueSystem(bindings);

	const ink = new InkStoryComponent();
	ink.story = compileStory(
		{ "main.ink": "* [Ok] -> END\n" },
		"main.ink",
	);
	ecs.createEntity([ink]);
	ecs.createEntity([new DialogueComponent(null)]);
	dialogueSystem.update(ctxFor(ecs, events));

	const hud = new DialogueHudState();
	new DialogueHudSyncSystem(hud, new LastUsedDevice()).update(
		ctxFor(ecs, events),
	);

	const root = new UiRoot();
	root.flushSyncFromReconciler(() =>
		root.mount(createElement(DialogueHud, { store: hud })),
	);
	const dyn = new DynStore();
	new DialogueHudDynSystem(root, dyn).render({
		ecs,
	} as never);

	const glyphs = findById(root.tree, DIALOGUE_GLYPHS_ID)!;
	expect(glyphs).not.toBeNull();
	expect(dyn.get(glyphs.id)?.reveal).toBe(0);
});
