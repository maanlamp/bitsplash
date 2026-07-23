import { TILE_SIZE } from "../../engine/tilemap/tile";
import {
	deleteEntities,
	duplicateEntities,
	nudgeEntities,
} from "../commands";
import { editorSettings } from "../editor-settings";
import { MODES } from "../modes";
import type { SceneView } from "../scene-view";
import type { ViewId, WindowId } from "../workspace/layout";
import { isAssetView, parseViewId } from "../workspace/view-registry";
import { useScopedHotkeys } from "./use-scoped-hotkeys";

/**
 * Per-direction unit nudge, keyed by the arrow key react-hotkeys-hook reports.
 * Scaled by the caller's step (1px, the configured nudge step, or a full tile).
 */
const NUDGE_DELTAS: Readonly<
	Record<string, Readonly<{ x: number; y: number }>>
> = {
	up: { x: 0, y: -1 },
	down: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
};

/**
 * The app-level operations the window hotkeys drive. Every method reads live
 * editor state through refs (or is a stable callback), so a stale closure still
 * resolves current state — which lets {@link WindowHotkeys} bind fresh callbacks
 * every render without stale-capture bugs. The window-scoped queries take the
 * registering window's id, so a hotkey acts on the window it fired in.
 */
export type WindowHotkeyHandlers = Readonly<{
	/** Whether the given window's focused view is an asset editor (suppresses scene commands). */
	assetFocusedIn: (windowId: WindowId) => boolean;
	/** The given window's focused view id, or `null`. */
	windowFocusedView: (windowId: WindowId) => ViewId | null;
	/** The scene view document-scoped commands target (resolved from the active window). */
	commandSceneView: () => SceneView | null;
	/** The id of {@link commandSceneView}, or `null` when no scene view is targetable. */
	commandSceneViewId: () => ViewId | null;
	toggleRunMode: () => void;
	stepRun: () => void;
	startRun: () => void;
	stopRun: () => void;
	toggleRunPause: () => void;
	playGame: () => void;
	/** Close a view through the dirty guard and closed-stack machinery. */
	closeView: (id: ViewId) => void;
	/** Reopen the most recently closed view/window, targeting the given window. */
	reopenClosed: (windowId: WindowId) => void;
	/** Persist a scene document to disk. */
	saveScene: (
		sceneId: string,
		view: SceneView,
	) => void | Promise<void>;
	undoAssetBrowser: () => void;
	redoAssetBrowser: () => void;
}>;

/**
 * Registers the editor's app-level hotkeys (run controls, selection, nudge,
 * save/undo/redo, close, reopen) scoped to the owning window's `document`.
 *
 * Rendered once inside every window's shell (hub and each satellite), so
 * {@link useScopedHotkeys} → `useWindowDocument()` resolves to that window's own
 * `document` and the listeners bind there. A keydown in window X therefore fires
 * only X's listeners — app-level hotkeys work in a focused popout, and there is
 * no cross-window double-fire. Renders nothing; it only installs listeners.
 *
 * Gating is per-window: editor commands enable on {@link editorEnabled} (the
 * window's own run-input gate) and run controls on {@link running}. Window-local
 * commands (close, reopen, escape, undo/redo, asset detection) act on the
 * registering window; scene document commands resolve through the shared
 * active-window router as before.
 */
export const WindowHotkeys = ({
	windowId,
	running,
	editorEnabled,
	handlers,
}: Readonly<{
	windowId: WindowId;
	running: boolean;
	editorEnabled: boolean;
	handlers: WindowHotkeyHandlers;
}>) => {
	const {
		assetFocusedIn,
		windowFocusedView,
		commandSceneView,
		commandSceneViewId,
		toggleRunMode,
		stepRun,
		startRun,
		stopRun,
		toggleRunPause,
		playGame,
		closeView,
		reopenClosed,
		saveScene,
		undoAssetBrowser,
		redoAssetBrowser,
	} = handlers;

	const assetFocused = (): boolean => assetFocusedIn(windowId);
	const focusedView = (): ViewId | null =>
		windowFocusedView(windowId);

	const nudge = (
		event: KeyboardEvent,
		dirKey: string | undefined,
		step: number,
	): void => {
		if (assetFocused()) {
			return;
		}
		const delta = NUDGE_DELTAS[dirKey ?? ""];
		const view = commandSceneView();
		const ids = view ? [...view.store.selection.ids] : [];
		if (!delta || !view || ids.length === 0) {
			return;
		}
		event.preventDefault();
		nudgeEntities(view.document, ids, delta.x * step, delta.y * step);
	};

	useScopedHotkeys(
		"tab",
		(event) => {
			event.preventDefault();
			toggleRunMode();
		},
		{ enabled: running, preventDefault: true },
	);
	useScopedHotkeys(
		"period",
		() => {
			stepRun();
		},
		{ enabled: running },
	);
	useScopedHotkeys(
		"r",
		() => {
			if (assetFocused()) {
				return;
			}
			stopRun();
		},
		{ enabled: running },
	);

	useScopedHotkeys(
		MODES.map((m) => m.shortcut).join(","),
		(_event, handler) => {
			if (assetFocused()) {
				return;
			}
			const key = handler.keys?.[0];
			const target = MODES.find((m) => m.shortcut === key);
			if (target) {
				commandSceneView()?.store.setMode(target.id);
			}
		},
		{ enabled: editorEnabled },
	);
	useScopedHotkeys(
		"p",
		() => {
			if (assetFocused()) {
				return;
			}
			if (running) {
				toggleRunPause();
			} else {
				startRun();
			}
		},
		{ enabled: true },
	);
	useScopedHotkeys(
		"shift+p",
		() => {
			if (assetFocused()) {
				return;
			}
			playGame();
		},
		{ enabled: true },
	);
	useScopedHotkeys(
		"escape",
		() => {
			const id = focusedView();
			if (id && isAssetView(id)) {
				closeView(id);
				return;
			}
			commandSceneView()?.store.clear();
		},
		{ enabled: editorEnabled },
	);
	useScopedHotkeys(
		"mod+a",
		(event) => {
			if (assetFocused()) {
				return;
			}
			event.preventDefault();
			const view = commandSceneView();
			if (view) {
				view.store.select(view.scene.ecs.entities());
			}
		},
		{ preventDefault: true, enabled: editorEnabled },
	);
	useScopedHotkeys(
		"mod+shift+a",
		(event) => {
			if (assetFocused()) {
				return;
			}
			event.preventDefault();
			const view = commandSceneView();
			if (view) {
				const current = view.store.selection.ids;
				view.store.select(
					view.scene.ecs.entities().filter((id) => !current.has(id)),
				);
			}
		},
		{ preventDefault: true, enabled: editorEnabled },
	);
	useScopedHotkeys(
		"delete,backspace",
		() => {
			const view = commandSceneView();
			const ids = view ? [...view.store.selection.ids] : [];
			if (assetFocused() || !view || ids.length === 0) {
				return;
			}
			deleteEntities(view.document, ids);
			view.store.clear();
		},
		{ enabled: editorEnabled },
	);
	useScopedHotkeys(
		"mod+d",
		(event) => {
			event.preventDefault();
			if (assetFocused()) {
				return;
			}
			const view = commandSceneView();
			const ids = view ? [...view.store.selection.ids] : [];
			if (view && ids.length > 0) {
				const copies = duplicateEntities(view.document, ids);
				if (copies.length > 0) {
					view.store.select(copies);
				}
			}
		},
		{ preventDefault: true, enabled: editorEnabled },
	);
	useScopedHotkeys(
		"up,down,left,right",
		(event, handler) => nudge(event, handler.keys?.[0], 1),
		{ preventDefault: false, enabled: editorEnabled },
	);
	useScopedHotkeys(
		"shift+up,shift+down,shift+left,shift+right",
		(event, handler) =>
			nudge(event, handler.keys?.[0], editorSettings.nudgeStep),
		{ preventDefault: false, enabled: editorEnabled },
	);
	useScopedHotkeys(
		"shift+mod+up,shift+mod+down,shift+mod+left,shift+mod+right",
		(event, handler) => nudge(event, handler.keys?.[0], TILE_SIZE),
		{ preventDefault: false, enabled: editorEnabled },
	);
	useScopedHotkeys(
		"mod+w",
		(event) => {
			event.preventDefault();
			const id = focusedView();
			if (id) {
				closeView(id);
			}
		},
		{ preventDefault: true, enabled: editorEnabled },
	);
	useScopedHotkeys(
		"mod+shift+t",
		(event) => {
			event.preventDefault();
			reopenClosed(windowId);
		},
		{ preventDefault: true, enabled: editorEnabled },
	);
	useScopedHotkeys(
		"mod+s",
		(event) => {
			event.preventDefault();
			if (assetFocused()) {
				return;
			}
			const id = commandSceneViewId();
			const view = commandSceneView();
			if (id && view) {
				const { param } = parseViewId(id);
				if (param) {
					void saveScene(param, view);
				}
			}
		},
		{
			preventDefault: true,
			enabled: editorEnabled,
			enableOnFormTags: true,
		},
	);
	useScopedHotkeys(
		"mod+z",
		(event) => {
			const id = focusedView();
			if (id && parseViewId(id).kind === "asset-browser") {
				event.preventDefault();
				undoAssetBrowser();
				return;
			}
			if (assetFocused()) {
				return;
			}
			event.preventDefault();
			commandSceneView()?.document.undo();
		},
		{
			preventDefault: true,
			enabled: editorEnabled,
			enableOnFormTags: true,
		},
	);
	useScopedHotkeys(
		"mod+y",
		(event) => {
			const id = focusedView();
			if (id && parseViewId(id).kind === "asset-browser") {
				event.preventDefault();
				redoAssetBrowser();
				return;
			}
			if (assetFocused()) {
				return;
			}
			event.preventDefault();
			commandSceneView()?.document.redo();
		},
		{
			preventDefault: true,
			enabled: editorEnabled,
			enableOnFormTags: true,
		},
	);

	return null;
};
