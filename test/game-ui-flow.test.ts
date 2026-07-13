import { beforeAll, expect, test } from "bun:test";
import { createElement } from "react";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import { UiEventDispatcher } from "../src/engine/ui/input/event-dispatcher";
import { UiRoot } from "../src/engine/ui/reconciler/ui-root";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";
import type { SaveMetadata } from "../src/engine/save/save-driver";
import type { GameUiActions } from "../src/game/ui/game-ui-actions";
import { GameUiState } from "../src/game/ui/game-ui-state";
import { GameUI } from "../src/game/ui/game-ui";
import { HudState } from "../src/game/ui/hud-state";
import { DialogueHudState } from "../src/game/dialogue/dialogue-hud-state";
import { HealthBarHudState } from "../src/game/health/health-bar-hud-state";
import { InteractHintHudState } from "../src/game/interaction/interact-hint-hud-state";
import { QuestMarkerHudState } from "../src/game/quest/quest-marker-hud-state";
import { SkipHintState } from "../src/game/ui/skip-hint-state";

beforeAll(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = false;
});

type Calls = Record<string, string[]>;

const makeActions = (): { actions: GameUiActions; calls: Calls } => {
	const calls: Calls = {
		newGame: [],
		continueLatest: [],
		openLoad: [],
		closeLoad: [],
		loadSlot: [],
		deleteSlot: [],
		resume: [],
		saveGame: [],
		quit: [],
	};
	const actions: GameUiActions = {
		newGame: () => calls.newGame!.push("x"),
		continueLatest: () => calls.continueLatest!.push("x"),
		openLoad: () => calls.openLoad!.push("x"),
		closeLoad: () => calls.closeLoad!.push("x"),
		loadSlot: (slot) => calls.loadSlot!.push(slot),
		deleteSlot: (slot) => calls.deleteSlot!.push(slot),
		resume: () => calls.resume!.push("x"),
		saveGame: () => calls.saveGame!.push("x"),
		quit: () => calls.quit!.push("x"),
	};
	return { actions, calls };
};

const save = (slot: string, savedAt: number): SaveMetadata => ({
	slot,
	kind: "manual",
	savedAt,
	label: "",
});

const rest: DeviceSnapshot = {
	keyboard: { keys: {} },
	mouse: {
		buttons: {},
		position: { x: -1, y: -1 },
		wheel: { x: 0, y: 0 },
	},
	gamepads: {},
};

const withKey = (key: string): DeviceSnapshot => ({
	...rest,
	keyboard: { keys: { [key]: true } },
});

const hasLabel = (node: UiNode, label: string): boolean => {
	if (node.type === "text" && node.props.children === label) {
		return true;
	}
	return node.children.some((child) => hasLabel(child, label));
};

const findButton = (root: UiNode, label: string): UiNode | null => {
	if (root.props.focusable === true && hasLabel(root, label)) {
		return root;
	}
	for (const child of root.children) {
		const found = findButton(child, label);
		if (found) {
			return found;
		}
	}
	return null;
};

const mount = (
	state: GameUiState,
	actions: GameUiActions,
): { root: UiRoot; dispatcher: UiEventDispatcher } => {
	const root = new UiRoot();
	root.flushSyncFromReconciler(() =>
		root.mount(
			createElement(GameUI, {
				state,
				actions,
				hud: new HudState(),
				dialogue: new DialogueHudState(),
				healthBars: new HealthBarHudState(),
				interactHint: new InteractHintHudState(),
				questMarkers: new QuestMarkerHudState(),
				skipHint: new SkipHintState(),
			}),
		),
	);
	return { root, dispatcher: new UiEventDispatcher() };
};

const confirm = (
	dispatcher: UiEventDispatcher,
	root: UiNode,
	target: UiNode,
): void => {
	dispatcher.focusNav.focus(target);
	dispatcher.dispatch(root, rest, 1, 0.016);
	dispatcher.dispatch(root, withKey("ENTER"), 1, 0.016);
};

test("menu phase renders the main menu and New Game activates", () => {
	const state = new GameUiState();
	const { actions, calls } = makeActions();
	const { root, dispatcher } = mount(state, actions);

	const newGame = findButton(root.tree, "New Game");
	expect(newGame).not.toBeNull();
	confirm(dispatcher, root.tree, newGame!);
	expect(calls.newGame).toHaveLength(1);
});

test("Continue is not focusable without saves, focusable with saves", () => {
	const state = new GameUiState();
	const { actions, calls } = makeActions();
	const { root, dispatcher } = mount(state, actions);

	expect(findButton(root.tree, "Continue")).toBeNull();

	root.flushSyncFromReconciler(() =>
		state.setSaves([save("manual__1__a", 1)]),
	);

	const cont = findButton(root.tree, "Continue");
	expect(cont).not.toBeNull();
	confirm(dispatcher, root.tree, cont!);
	expect(calls.continueLatest).toHaveLength(1);
});

test("pause menu appears only while playing and paused; Resume activates", () => {
	const state = new GameUiState();
	const { actions, calls } = makeActions();
	const { root, dispatcher } = mount(state, actions);

	expect(findButton(root.tree, "Resume")).toBeNull();

	root.flushSyncFromReconciler(() => {
		state.setPhase("playing");
		state.setPaused(true);
	});

	const resume = findButton(root.tree, "Resume");
	expect(resume).not.toBeNull();
	confirm(dispatcher, root.tree, resume!);
	expect(calls.resume).toHaveLength(1);
});

test("load view lists saves and activating a row loads that slot", () => {
	const state = new GameUiState();
	const { actions, calls } = makeActions();
	const { root, dispatcher } = mount(state, actions);

	root.flushSyncFromReconciler(() => {
		state.setSaves([save("manual__42__hero", 42)]);
		state.setView("load");
	});

	const back = findButton(root.tree, "Back");
	expect(back).not.toBeNull();

	const entry = findButton(root.tree, "Manual save");
	expect(entry).not.toBeNull();
	confirm(dispatcher, root.tree, entry!);
	expect(calls.loadSlot).toEqual(["manual__42__hero"]);
});
