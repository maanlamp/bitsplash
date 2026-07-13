import { beforeAll, expect, test } from "bun:test";
import { createElement } from "react";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import { UiEventDispatcher } from "../src/engine/ui/input/event-dispatcher";
import { YogaBridge } from "../src/engine/ui/layout/yoga-bridge";
import { createTextMeasureProvider } from "../src/engine/ui/layout/measure-text";
import { UiRoot } from "../src/engine/ui/reconciler/ui-root";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";
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

const UI_SCALE = 3;
const WIDTH = 1200;
const HEIGHT = 900;

const rest: DeviceSnapshot = {
	keyboard: { keys: {} },
	mouse: {
		buttons: {},
		position: { x: -1, y: -1 },
		wheel: { x: 0, y: 0 },
	},
	gamepads: {},
};

const at = (
	x: number,
	y: number,
	buttons: string[] = [],
): DeviceSnapshot => {
	const pressed: Record<string, boolean> = {};
	for (const button of buttons) {
		pressed[button] = true;
	}
	return {
		keyboard: { keys: {} },
		mouse: {
			buttons: pressed,
			position: { x, y },
			wheel: { x: 0, y: 0 },
		},
		gamepads: {},
	};
};

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

const makeActions = (): {
	actions: GameUiActions;
	calls: string[];
} => {
	const calls: string[] = [];
	const noop = () => {};
	const actions: GameUiActions = {
		newGame: () => calls.push("newGame"),
		continueLatest: noop,
		openLoad: noop,
		closeLoad: noop,
		loadSlot: noop,
		deleteSlot: noop,
		resume: noop,
		saveGame: noop,
		quit: noop,
	};
	return { actions, calls };
};

test("clicking New Game with the mouse activates it (real reconciler + real layout)", () => {
	const state = new GameUiState();
	const { actions, calls } = makeActions();

	const bridge = new YogaBridge(
		createTextMeasureProvider(() => null),
	);
	const root = new UiRoot({ yoga: bridge });
	const dispatcher = new UiEventDispatcher();

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

	const layout = (): void =>
		bridge.calculate(root.tree, WIDTH / UI_SCALE, HEIGHT / UI_SCALE);

	layout();

	const newGame = findButton(root.tree, "New Game");
	expect(newGame).not.toBeNull();
	const rect = newGame!.layoutRect!;
	expect(rect.w).toBeGreaterThan(0);
	expect(rect.h).toBeGreaterThan(0);

	const cx = (rect.x + rect.w / 2) * UI_SCALE;
	const cy = (rect.y + rect.h / 2) * UI_SCALE;

	const frame = (input: DeviceSnapshot): void => {
		root.flushSyncFromReconciler(() => {
			dispatcher.dispatch(root.tree, input, UI_SCALE, 0.016);
		});
		layout();
	};

	frame(rest);
	frame(at(cx, cy));
	frame(at(cx, cy, ["left"]));
	frame(at(cx, cy));

	expect(calls).toEqual(["newGame"]);
});
