import { beforeAll, expect, test } from "bun:test";
import { createElement } from "react";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import { UiEventDispatcher } from "../src/engine/ui/input/event-dispatcher";
import { YogaBridge } from "../src/engine/ui/layout/yoga-bridge";
import { createTextMeasureProvider } from "../src/engine/ui/layout/measure-text";
import { UiRoot } from "../src/engine/ui/reconciler/ui-root";
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

const noop = () => {};

const actions: GameUiActions = {
	newGame: noop,
	continueLatest: noop,
	openLoad: noop,
	closeLoad: noop,
	loadSlot: noop,
	deleteSlot: noop,
	resume: noop,
	saveGame: noop,
	quit: noop,
};

const at = (x: number, y: number): DeviceSnapshot => ({
	keyboard: { keys: {} },
	mouse: {
		buttons: { left: true },
		position: { x, y },
		wheel: { x: 0, y: 0 },
	},
	gamepads: {},
});

test("playing: pointer over the HUD does not consume mouse:left (bow still fires)", () => {
	const state = new GameUiState();
	state.setPhase("playing");

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
	bridge.calculate(root.tree, WIDTH / UI_SCALE, HEIGHT / UI_SCALE);

	// Center of the screen, where the (invisible) death banner bar sits.
	const input = at(WIDTH / 2, HEIGHT / 2);
	root.flushSyncFromReconciler(() =>
		dispatcher.dispatch(root.tree, input, UI_SCALE, 0.016),
	);

	expect(dispatcher.consumed.has("mouse:left")).toBe(false);
	expect(dispatcher.maskedInput(input).mouse.buttons.left).toBe(true);
});
