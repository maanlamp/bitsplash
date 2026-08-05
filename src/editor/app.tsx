import clsx from "clsx";
import {
	lazy,
	type ReactNode,
	Suspense,
	use,
	useCallback,
	useEffect,
	useReducer,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { Clock } from "../engine/clock";
import type { Milliseconds } from "../engine/duration";
import type { EntityId } from "../engine/ecs";
import type { Game } from "../engine/game";
import { audioFocus } from "../engine/audio/audio-focus";
import { NULL_ACTIONS } from "../engine/input/bindings/action-provider";
import type { FrameProfile } from "../engine/profiling/frame-profile";
import type { GameModule } from "../engine/runtime/game-module";
import { MAX_FRAME_MS } from "../engine/runtime/host";
import { createGame } from "../engine/scene/registry";
import type { DirEntry } from "../project-rpc";
import { ActiveScene } from "./active-scene";
import styles from "./app.module.scss";
import { AssetBrowser } from "./asset-browser/asset-browser";
import { type AssetCreateActions } from "./asset-context-menu";
import {
	type AssetEntry,
	assetFilename,
	isFontName,
	isTilesetName,
} from "./assets";
import { ConsoleView } from "./console/console-view";
import { DebugFlags } from "./debug-flags";
import { disposeDocument } from "./document/document-store";
import {
	AddComponentPicker,
	type MenuDeps,
} from "./entity-context-menu";
import { History } from "./history";
import Inspector, {
	SceneConfigInspector,
} from "./inspector/inspector";
import "./inspector/register-renderers";
import KeepEditingDialog from "./keep-editing-dialog";
import Loading from "./loading";
import { usedHeapBytes } from "./perf/heap";
import {
	getPlaytestPhase,
	launchPlaytest,
	subscribePlaytest,
} from "./playtest-state";
import ProfilerView from "./profiler/profiler-view";
import { Project } from "./project";
import {
	getAssetsRoot,
	isDesktop,
	listAssetsDeep,
	saveLevel,
} from "./project-io";
import ProjectTree from "./project-tree";
import "./register-drops";
import { RunHost } from "./run-host";
import {
	isSceneLockedOut,
	runStopsOnViewClose,
	runStopsOnWindowClose,
} from "./run-lockdown";
import type { SceneDocument } from "./scene-document";
import { SceneView } from "./scene-view";
import SceneViewPanel from "./scene-view-panel";
import { SelectionChannel } from "./selection-channel";
import NewSpriteDialog from "./sprite/new-sprite-dialog";
import type { NewSpriteConfig } from "./sprite/sprite-editor";
import { setFocusedToastWindow, toastError } from "./toast";
import { useSatelliteWindows } from "./window/use-satellite-windows";
import {
	type WindowHotkeyHandlers,
	WindowHotkeys,
} from "./window/window-hotkeys";
import WindowShell from "./window/window-shell";
import {
	ClosedStack,
	type WindowBounds,
} from "./workspace/closed-stack";
import {
	firstSceneView,
	resolveCommandSceneView,
} from "./workspace/command-routing";
import { dirtyDocumentsForClose } from "./workspace/dirty-guard";
import type { DropAction } from "./workspace/drop-action";
import {
	isGuardDialogOpen,
	setGuardDialogOpen,
} from "./workspace/guard-signal";
import {
	allViewIds,
	collapseEmptyWindows,
	findView,
	getWindow,
	HUB_WINDOW_ID,
	insertView,
	isViewMuted,
	moveView,
	moveViewAcrossWindows,
	pruneViews,
	removeView,
	replaceWindowRoot,
	setActive,
	setTabsViews,
	setViewMuted,
	spawnWindowWithView,
	tabGroupOfView,
	updateWindow,
	type ViewId,
	type WindowId,
	type WindowLayout,
	windowOfView,
	type Workspace as WorkspaceState,
} from "./workspace/layout";
import {
	flushWorkspace,
	loadWorkspace,
	saveWorkspace,
} from "./workspace/persist";
import { TabDragContext } from "./workspace/tab-drag-context";
import {
	type TabDragConfig,
	TabDragController,
	type WindowRealm,
} from "./workspace/tab-drag-controller";
import { viewBarState } from "./workspace/view-bar-state";
import {
	assetViewId,
	isAssetView,
	isSceneView,
	isStructurallyValidViewId,
	isValidViewId,
	makeViewId,
	NEW_PARAM,
	parseViewId,
	viewTitle,
} from "./workspace/view-registry";
import workspaceStyles from "./workspace/workspace.module.scss";

/**
 * On-demand editor panels, code-split so they leave the editor's first-paint
 * graph. They are opened by picking an asset and are never in the default
 * layout, so most sessions never download or transform them at boot. Each is
 * rendered under a {@link Suspense} boundary whose fallback is the shared
 * {@link Loading} spinner (see `renderView`).
 */
const SpriteEditor = lazy(() => import("./sprite/sprite-editor"));
const AudioEditor = lazy(() => import("./audio/audio-editor"));
const FontPreview = lazy(() => import("./font/font-preview"));

/**
 * Suspends its subtree on a promise, then renders `children()`. Routes the
 * editor's runtime-readiness wait through the same {@link Suspense} boundary as
 * the lazy panels, so one {@link Loading} fallback covers both "runtime still
 * loading" and "panel chunk still downloading". `children` is a thunk so the
 * runtime-dependent JSX is only built once the runtime is ready.
 */
const RuntimeSuspender = ({
	ready,
	children,
}: Readonly<{
	ready: Promise<unknown>;
	children: () => ReactNode;
}>) => {
	use(ready);
	return <>{children()}</>;
};

const IS_MAC = /mac/i.test(navigator.platform);
const MOD = IS_MAC ? "⌘" : "Ctrl";
const UNDO_SHORTCUT = `${MOD}+Z`;
const REDO_SHORTCUT = `${MOD}+Y`;
const NEW_SPRITE_VIEW = "sprite:new";
const NEW_AUDIO_VIEW = "audio:new";

/**
 * A pending dirty-guard for one window: the unsaved documents its close would
 * discard (by title) and the action to run if the user chooses Discard. Keyed by
 * window in the shell so the "Keep editing / Discard" dialog renders in the
 * window where the close was invoked (plan line 161).
 */
type GuardRequest = Readonly<{
	docs: ReadonlyArray<string>;
	onDiscard: () => void;
}>;

/**
 * Main-process window-close choreography exposed by the Electron preload. Main
 * intercepts a native window close (hub/satellite title-bar X, app quit) and
 * routes it here so the DOM guard can run in the shared heap; the shell replies
 * with {@link WindowControlsBridge.allowClose} once the close may proceed.
 */
type WindowControlsBridge = Readonly<{
	onCloseRequested: (
		listener: (windowId: WindowId) => void,
	) => () => void;
	allowClose: (windowId: WindowId) => void;
}>;

/** The window-manifest read bridge (main-owned bounds/zoom), if present. */
type WindowManifestReadBridge = Readonly<{
	read: () => Promise<{
		windows: Record<WindowId, { bounds?: WindowBounds }>;
	}>;
}>;

const windowControls = (): WindowControlsBridge | undefined =>
	(globalThis as { windowControls?: WindowControlsBridge })
		.windowControls;

const windowManifestBridge = ():
	| WindowManifestReadBridge
	| undefined =>
	(globalThis as { windowManifest?: WindowManifestReadBridge })
		.windowManifest;

const ZERO_BOUNDS: WindowBounds = {
	x: 0,
	y: 0,
	width: 0,
	height: 0,
};

const hubOf = (ws: WorkspaceState): WindowLayout =>
	getWindow(ws, HUB_WINDOW_ID)!;

const allWorkspaceViewIds = (
	ws: WorkspaceState,
): ReadonlyArray<ViewId> =>
	ws.windows.flatMap((window) => allViewIds(window.root));

const pruneWorkspace = (
	ws: WorkspaceState,
	keep: (id: ViewId) => boolean,
): WorkspaceState => {
	let next = ws;
	for (const window of ws.windows) {
		const root = pruneViews(window.root, keep);
		if (root !== window.root) {
			next = replaceWindowRoot(next, window.id, root);
		}
	}
	return collapseEmptyWindows(next);
};

const pruneAssetViews = (
	ws: WorkspaceState,
	assets: ReadonlyArray<AssetEntry>,
): WorkspaceState =>
	pruneWorkspace(
		ws,
		(id) => !isAssetView(id) || isValidViewId(id, assets),
	);

const App = ({
	startScene,
	runtimeReady,
	gameModule,
}: Readonly<{
	startScene: string;
	runtimeReady: Promise<void>;
	gameModule: GameModule;
}>) => {
	const [game, setGame] = useState<Game | null>(null);
	const [addTarget, setAddTarget] = useState<Readonly<{
		entity: EntityId;
		windowId: WindowId;
	}> | null>(null);
	const [running, setRunning] = useState(false);
	const [runMode, setRunMode] = useState<"game" | "editor">("game");
	const [runFrozen, setRunFrozen] = useState(false);
	const [runningWindowId, setRunningWindowId] =
		useState<WindowId | null>(null);
	const playtestPhase = useSyncExternalStore(
		subscribePlaytest,
		getPlaytestPhase,
	);
	const [, forceStore] = useReducer((n: number) => n + 1, 0);
	const [assets, setAssets] = useState<ReadonlyArray<AssetEntry>>([]);
	const [assetsRoot, setAssetsRoot] = useState<string | null>(null);
	const assetBrowserHistoryRef = useRef(new History());
	const [activeSceneViewId, setActiveSceneViewId] =
		useState<ViewId | null>(null);
	const [activeWindowId, setActiveWindowId] =
		useState<WindowId>(HUB_WINDOW_ID);
	const activeWindowIdRef = useRef(activeWindowId);
	activeWindowIdRef.current = activeWindowId;
	const activeSceneByWindowRef = useRef(new Map<WindowId, ViewId>());
	const [workspace, setWorkspace] = useState<WorkspaceState>(() =>
		loadWorkspace(isStructurallyValidViewId, `scene:${startScene}`),
	);
	const workspaceRef = useRef(workspace);
	const updateWorkspace = (
		next: WorkspaceState | ((prev: WorkspaceState) => WorkspaceState),
	): void => {
		const value =
			typeof next === "function" ? next(workspaceRef.current) : next;
		workspaceRef.current = value;
		setWorkspace(value);
		saveWorkspace(value);
	};

	const hub = hubOf(workspace);

	const gameRef = useRef<Game | null>(null);
	const gameModuleRef = useRef<GameModule>(gameModule);
	gameModuleRef.current = gameModule;
	const projectRef = useRef<Project | null>(null);
	/**
	 * Resolved once the game runtime instance exists. Runtime-dependent views
	 * suspend on this via {@link RuntimeSuspender}, so their shared {@link Loading}
	 * fallback shows until boot completes. Reset to a fresh pending promise if the
	 * runtime is torn down and rebuilt.
	 */
	const gameReadyRef = useRef<{
		promise: Promise<void>;
		resolve: () => void;
	} | null>(null);
	if (!gameReadyRef.current) {
		let resolve!: () => void;
		const promise = new Promise<void>((r) => {
			resolve = r;
		});
		gameReadyRef.current = { promise, resolve };
	}
	const sceneViewsRef = useRef(new Map<ViewId, SceneView>());
	const debugFlagsRef = useRef(new DebugFlags());
	const docUnsubsRef = useRef(new Map<string, () => void>());
	const closedStackRef = useRef(new ClosedStack());
	const focusedSceneViewRef = useRef<SceneView | null>(null);
	const runHostRef = useRef<RunHost | null>(null);
	const activeSceneRef = useRef(new ActiveScene());
	const selectionChannelRef = useRef<SelectionChannel | null>(null);
	if (!selectionChannelRef.current) {
		selectionChannelRef.current = new SelectionChannel(
			activeSceneRef.current,
			(sceneId) => {
				const project = projectRef.current;
				if (!project) {
					return null;
				}
				const document = project.document(sceneId);
				return {
					store: project.store(sceneId),
					document,
					ecs: document.scene.ecs,
				};
			},
		);
	}
	const gameUiRef = useRef<ReturnType<
		GameModule["createGameUi"]
	> | null>(null);
	const windowLoopsRef = useRef(new Map<WindowId, () => void>());
	// Each window's realm (document + window), so the tab-drag controller can read
	// strip geometry and paint its ghost/indicator into any window. The hub realm
	// is the main globals; satellites register on open, deregister on close.
	const windowRealmsRef = useRef(
		new Map<WindowId, WindowRealm>([
			[HUB_WINDOW_ID, { doc: document, win: window }],
		]),
	);
	const dragControllerRef = useRef<TabDragController | null>(null);

	/** The window the user last interacted with; commands resolve within it. */
	const activeWindow = getWindow(workspace, activeWindowId) ?? hub;
	const focusedView = activeWindow.focused;
	useEffect(() => {
		if (focusedView && isSceneView(focusedView)) {
			setActiveSceneViewId(focusedView);
		}
	}, [focusedView]);

	/**
	 * Mark `windowId` as the active window and — only when its newly focused view
	 * is a scene view — move the global active-scene pointer to it. Bare window
	 * activation never moves the global pointer (plan A2).
	 */
	const markActive = (
		windowId: WindowId,
		focused: ViewId | null,
	): void => {
		setActiveWindowId(windowId);
		activeWindowIdRef.current = windowId;
		setFocusedToastWindow(windowId);
		if (focused && isSceneView(focused)) {
			activeSceneByWindowRef.current.set(windowId, focused);
			setActiveSceneViewId(focused);
		}
	};

	const onWindowChange = (
		windowId: WindowId,
		next: WindowLayout | ((prev: WindowLayout) => WindowLayout),
	): void => {
		updateWorkspace((ws) =>
			updateWindow(ws, windowId, (window) =>
				typeof next === "function" ? next(window) : next,
			),
		);
		const updated = getWindow(workspaceRef.current, windowId);
		markActive(windowId, updated?.focused ?? null);
	};

	/**
	 * Freeze (or resume) backing-store reallocation for every scene view in a
	 * window while one of its splitters is being dragged. Suspending letterboxes
	 * the frozen frame instead of reallocating the WebGL backing store every
	 * frame; resuming re-syncs each viewport once so the next rendered frame is
	 * crisp. Scoped to the dragged window — views elsewhere keep resizing live.
	 */
	const setWindowResizeSuspended = (
		windowId: WindowId,
		suspended: boolean,
	): void => {
		const window = getWindow(workspaceRef.current, windowId);
		if (!window) {
			return;
		}
		for (const id of allViewIds(window.root)) {
			if (!isSceneView(id)) {
				continue;
			}
			const viewport = sceneViewsRef.current.get(id)?.viewport;
			if (suspended) {
				viewport?.suspendResize();
			} else {
				viewport?.resumeResize();
			}
		}
	};

	const saveScene = async (
		sceneId: string,
		view: SceneView,
	): Promise<void> => {
		view.flushGestures();
		const file = view.document.save();
		await saveLevel(sceneId, JSON.stringify(file, null, "\t"));
		view.document.markSaved(file);
	};

	const hasOpenSceneView = (sceneId: string): boolean => {
		for (const key of sceneViewsRef.current.keys()) {
			if (parseViewId(key).param === sceneId) {
				return true;
			}
		}
		return false;
	};

	const ensureDocSubscription = (
		sceneId: string,
		doc: SceneDocument,
	): void => {
		if (docUnsubsRef.current.has(sceneId)) {
			return;
		}
		const unsub = doc.subscribe(() =>
			setSceneDirty(sceneId, doc.dirty),
		);
		docUnsubsRef.current.set(sceneId, unsub);
	};

	const ensureSceneView = (id: ViewId): SceneView | null => {
		const instance = gameRef.current;
		const project = projectRef.current;
		if (!instance || !project) {
			return null;
		}
		const existing = sceneViewsRef.current.get(id);
		if (existing) {
			return existing;
		}
		const { param } = parseViewId(id);
		if (!param || !isValidViewId(id, [])) {
			return null;
		}
		const document = project.document(param);
		const view = new SceneView(
			id,
			document,
			project.store(param),
			debugFlagsRef.current,
			instance.services,
		);
		ensureDocSubscription(param, document);
		view.setMuted(isViewMuted(workspaceRef.current, id));
		sceneViewsRef.current.set(id, view);
		return view;
	};

	/**
	 * Mute or unmute one scene view. The workspace owns the flag so it survives a
	 * reload, and the view's own bus is what actually goes quiet — the asset
	 * preview bus is a sibling of the whole scene-view subtree, so the audio
	 * editor keeps sounding through it.
	 */
	const setSceneViewMuted = (id: ViewId, muted: boolean): void => {
		sceneViewsRef.current.get(id)?.setMuted(muted);
		updateWorkspace((ws) => setViewMuted(ws, id, muted));
	};

	const disposeSceneView = (id: ViewId): void => {
		const view = sceneViewsRef.current.get(id);
		if (!view) {
			return;
		}
		view.dispose();
		sceneViewsRef.current.delete(id);
		const sceneId = parseViewId(id).param;
		if (sceneId && !hasOpenSceneView(sceneId)) {
			docUnsubsRef.current.get(sceneId)?.();
			docUnsubsRef.current.delete(sceneId);
		}
	};

	if (game) {
		for (const id of allWorkspaceViewIds(workspace)) {
			if (isSceneView(id)) {
				ensureSceneView(id);
			}
		}
	}

	const activeSceneId =
		activeSceneViewId && windowOfView(workspace, activeSceneViewId)
			? activeSceneViewId
			: focusedView && isSceneView(focusedView)
				? focusedView
				: null;
	const focusedSceneView = activeSceneId
		? (sceneViewsRef.current.get(activeSceneId) ?? null)
		: null;
	const focusedScene = focusedSceneView?.scene ?? null;
	const focusedSceneId = activeSceneId
		? parseViewId(activeSceneId).param
		: null;
	const focusedStore = focusedSceneView?.store ?? null;
	const selectedEntity = focusedStore?.primaryId ?? null;
	const inspectingWorld = focusedStore?.inspectingWorld ?? false;

	useEffect(() => {
		focusedSceneViewRef.current = focusedSceneView;
		activeSceneRef.current.set(
			focusedSceneView ? focusedSceneId : null,
		);
	}, [focusedSceneView, activeSceneId, focusedSceneId]);

	useEffect(() => {
		if (!focusedStore) {
			return;
		}
		return focusedStore.subscribe(forceStore);
	}, [focusedStore]);

	useEffect(() => {
		const open = new Set(
			allWorkspaceViewIds(workspace).filter(isSceneView),
		);
		for (const id of sceneViewsRef.current.keys()) {
			if (!open.has(id)) {
				// The run's anchor view is about to be disposed (its tab or window
				// closed via any path): stop the run before disposing the SceneView
				// it references, so the frame loop never touches a dead view.
				if (
					runStopsOnViewClose(runHostRef.current?.view.id ?? null, id)
				) {
					stopRun();
				}
				disposeSceneView(id);
			}
		}
		const project = projectRef.current;
		if (!project) {
			return;
		}
		const scenes = new Set<string>();
		for (const id of open) {
			const sceneId = parseViewId(id).param;
			if (sceneId) {
				scenes.add(sceneId);
			}
		}
		for (const sceneId of scenes) {
			if (project.hasDocument(sceneId)) {
				setSceneDirty(sceneId, project.document(sceneId).dirty);
			}
		}
	}, [workspace]);

	/** The focused view id of a specific window (window-local, from live layout). */
	const windowFocusedView = (id: WindowId): ViewId | null =>
		getWindow(workspaceRef.current, id)?.focused ?? null;

	/** Whether a specific window's focused view is an asset editor. */
	const assetFocusedIn = (id: WindowId): boolean => {
		const focused = windowFocusedView(id);
		return !!focused && isAssetView(focused);
	};

	const [newSpriteKind, setNewSpriteKind] = useState<Readonly<{
		isTileset: boolean;
		windowId: WindowId;
	}> | null>(null);
	const [createConfig, setCreateConfig] = useState<
		(NewSpriteConfig & Readonly<{ isTileset: boolean }>) | null
	>(null);
	const [guards, setGuards] = useState<
		ReadonlyMap<WindowId, GuardRequest>
	>(() => new Map());

	const [dirtyViews, setDirtyViews] = useState<ReadonlySet<ViewId>>(
		() => new Set(),
	);
	const dirtyViewsRef = useRef(dirtyViews);
	dirtyViewsRef.current = dirtyViews;
	const setViewDirty = (id: ViewId, dirty: boolean): void => {
		setDirtyViews((prev) => {
			if (prev.has(id) === dirty) {
				return prev;
			}
			const next = new Set(prev);
			if (dirty) {
				next.add(id);
			} else {
				next.delete(id);
			}
			return next;
		});
	};
	/**
	 * Reflect a document's dirty state onto every open view of its scene (plan
	 * D13: dirty lives on the document, shared across its views). A save through
	 * any view clears the marker on all of them, in every window.
	 */
	const setSceneDirty = (sceneId: string, dirty: boolean): void => {
		setDirtyViews((prev) => {
			const next = new Set(prev);
			let changed = false;
			for (const id of allWorkspaceViewIds(workspaceRef.current)) {
				if (!isSceneView(id) || parseViewId(id).param !== sceneId) {
					continue;
				}
				if (dirty && !next.has(id)) {
					next.add(id);
					changed = true;
				} else if (!dirty && next.has(id)) {
					next.delete(id);
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	};
	const isViewDirty = (id: ViewId): boolean => dirtyViews.has(id);

	const anchorView = (window: WindowLayout): ViewId | null => {
		if (window.focused && isSceneView(window.focused)) {
			return window.focused;
		}
		return (
			firstSceneView(window.root) ??
			window.focused ??
			allViewIds(window.root)[0] ??
			null
		);
	};

	const openView = (
		id: ViewId,
		targetWindowId: WindowId = activeWindowIdRef.current,
	): void => {
		const ws = workspaceRef.current;
		const home = windowOfView(ws, id);
		if (home) {
			updateWorkspace(
				updateWindow(ws, home, (w) => ({
					...w,
					root: setActive(w.root, id),
					focused: id,
				})),
			);
			markActive(home, id);
			return;
		}
		const targetId = getWindow(ws, targetWindowId)
			? targetWindowId
			: HUB_WINDOW_ID;
		const window = getWindow(ws, targetId)!;
		const anchor = anchorView(window);
		const anchorPath = anchor ? findView(window.root, anchor) : null;
		const root = anchorPath
			? insertView(window.root, id, anchorPath, "center")
			: insertView(window.root, id, [], "center");
		updateWorkspace(
			updateWindow(ws, targetId, (w) => ({
				...w,
				root,
				focused: id,
			})),
		);
		markActive(targetId, id);
	};

	const removeViewNow = (id: ViewId): void => {
		const ws = workspaceRef.current;
		const home = windowOfView(ws, id);
		if (!home) {
			return;
		}
		let root = removeView(getWindow(ws, home)!.root, id);
		setViewDirty(id, false);
		disposeDocument(id);
		const nextFocus =
			firstSceneView(root) ?? allViewIds(root)[0] ?? null;
		if (nextFocus) {
			root = setActive(root, nextFocus);
		}
		const next = collapseEmptyWindows(
			updateWindow(ws, home, (w) => ({
				...w,
				root,
				focused: nextFocus,
			})),
		);
		updateWorkspace(next);
	};

	const recordClosed = (id: ViewId): void => {
		if (id === NEW_SPRITE_VIEW || id === NEW_AUDIO_VIEW) {
			return;
		}
		const ws = workspaceRef.current;
		const windowId = windowOfView(ws, id) ?? HUB_WINDOW_ID;
		const window = getWindow(ws, windowId);
		const tabGroupId = window
			? tabGroupOfView(window.root, id)
			: null;
		if (!tabGroupId) {
			return;
		}
		closedStackRef.current = closedStackRef.current.pushView(
			id,
			tabGroupId,
			windowId,
		);
	};

	const discardView = (id: ViewId): void => {
		if (isSceneView(id)) {
			sceneViewsRef.current.get(id)?.document.revert();
		}
		recordClosed(id);
		removeViewNow(id);
	};

	const sceneViewCount = (sceneId: string): number =>
		allWorkspaceViewIds(workspaceRef.current).filter(
			(v) => isSceneView(v) && parseViewId(v).param === sceneId,
		).length;

	/** Raise (or replace) the dirty-guard dialog for `windowId`. */
	const requestGuard = (
		windowId: WindowId,
		docs: ReadonlyArray<string>,
		onDiscard: () => void,
	): void => {
		setGuards((prev) => {
			const next = new Map(prev);
			next.set(windowId, { docs, onDiscard });
			return next;
		});
	};

	/** Dismiss `windowId`'s dirty-guard dialog (Keep editing, or after Discard). */
	const resolveGuard = (windowId: WindowId): void => {
		setGuards((prev) => {
			if (!prev.has(windowId)) {
				return prev;
			}
			const next = new Map(prev);
			next.delete(windowId);
			return next;
		});
	};

	const closeView = (id: ViewId): void => {
		// Closing the run's anchor view (its tab) stops the run first — otherwise
		// disposing the SceneView the run still references would crash the loop.
		// Stopping never prompts (plan lines 149-152).
		if (
			runStopsOnViewClose(runHostRef.current?.view.id ?? null, id)
		) {
			stopRun();
		}
		const sceneId = isSceneView(id) ? parseViewId(id).param : null;
		if (sceneId && sceneViewCount(sceneId) > 1) {
			recordClosed(id);
			removeViewNow(id);
			return;
		}
		if (isViewDirty(id)) {
			const home =
				windowOfView(workspaceRef.current, id) ?? HUB_WINDOW_ID;
			requestGuard(home, [viewTitle(id)], () => discardView(id));
		} else {
			recordClosed(id);
			removeViewNow(id);
		}
	};

	/**
	 * The dirty views a window-close (or app quit) would discard: closing the hub
	 * quits, so its guard aggregates every window; closing a satellite lists only
	 * that window's dirty documents (plan lines 96-100). One view per document is
	 * a global invariant, so a dirty view maps 1:1 to a dirty document.
	 */
	const dirtyViewsForClose = (
		windowId: WindowId,
	): ReadonlyArray<ViewId> =>
		dirtyDocumentsForClose(workspaceRef.current, windowId, (id) =>
			dirtyViewsRef.current.has(id),
		);

	/** Discard the unsaved documents a window close would lose, then let it close. */
	const discardWindowClose = (windowId: WindowId): void => {
		for (const id of dirtyViewsForClose(windowId)) {
			if (isSceneView(id)) {
				sceneViewsRef.current.get(id)?.document.revert();
			}
			setViewDirty(id, false);
			disposeDocument(id);
		}
		windowControls()?.allowClose(windowId);
	};

	/**
	 * Handle main's native-close request for `windowId` (title-bar X or app quit):
	 * if nothing is dirty, allow the close immediately; otherwise raise the guard
	 * in that window, discarding-then-allowing on Discard, aborting on Keep editing.
	 */
	const requestWindowClose = (windowId: WindowId): void => {
		// Closing the window hosting the run's anchor view stops the run first
		// (tab or window close, plan lines 149-151); stopping never prompts.
		const host = runHostRef.current;
		const anchorWindowId = host
			? (windowOfView(workspaceRef.current, host.view.id) ?? null)
			: null;
		if (runStopsOnWindowClose(anchorWindowId, windowId)) {
			stopRun();
		}
		const dirty = dirtyViewsForClose(windowId);
		if (dirty.length === 0) {
			windowControls()?.allowClose(windowId);
			return;
		}
		requestGuard(windowId, dirty.map(viewTitle), () =>
			discardWindowClose(windowId),
		);
	};

	const moveToNewWindow = (id: ViewId): void => {
		updateWorkspace((ws) => spawnWindowWithView(ws, id));
	};

	/** Activate a view within a specific window and make that window active. */
	const activateInWindow = (
		windowId: WindowId,
		viewId: ViewId,
	): void => {
		updateWorkspace((ws) =>
			updateWindow(ws, windowId, (w) => ({
				...w,
				root: setActive(w.root, viewId),
				focused: viewId,
			})),
		);
		markActive(windowId, viewId);
	};

	/** Apply a resolved tab-drop by running the matching pure layout op. */
	const commitDrop = (action: DropAction): void => {
		switch (action.kind) {
			case "reorder":
				updateWorkspace((ws) =>
					updateWindow(ws, action.windowId, (w) => ({
						...w,
						root: setTabsViews(w.root, action.anchor, action.order),
					})),
				);
				break;
			case "move-in-window":
				updateWorkspace((ws) =>
					updateWindow(ws, action.windowId, (w) => ({
						...w,
						root: moveView(
							w.root,
							action.viewId,
							action.anchor,
							action.zone,
						),
						focused: action.viewId,
					})),
				);
				markActive(action.windowId, action.viewId);
				break;
			case "move-across":
				updateWorkspace((ws) =>
					moveViewAcrossWindows(ws, action.viewId, {
						windowId: action.windowId,
						anchorViewId: action.anchor,
						zone: action.zone,
					}),
				);
				markActive(action.windowId, action.viewId);
				break;
			case "spawn":
				// A reuse-spawn (only-tab-of-window) leaves the layout untouched; the
				// gesture repositions the existing OS window. A fresh spawn tears the
				// view into a new satellite at the id the gesture minted (and seeded
				// bounds for), so it opens at the cursor.
				if (!action.reuseWindowId) {
					updateWorkspace((ws) =>
						spawnWindowWithView(ws, action.viewId, action.windowId),
					);
				}
				break;
			case "none":
				break;
		}
	};

	/** Pre-bake a scene view's GPU state into its move destination (ghost drag). */
	const prewarmMove = (
		viewId: ViewId,
		destWindowId: WindowId,
	): void => {
		const realm = windowRealmsRef.current.get(destWindowId);
		if (realm) {
			sceneViewsRef.current.get(viewId)?.prewarmMove(realm.doc);
		}
	};

	const cancelPrewarmMove = (viewId: ViewId): void => {
		sceneViewsRef.current.get(viewId)?.cancelPrewarmMove();
	};

	const dragBridge =
		(globalThis as { desktopDrag?: TabDragConfig["bridge"] })
			.desktopDrag ?? null;

	const dragConfig: TabDragConfig = {
		getWorkspace: () => workspaceRef.current,
		realm: (windowId) =>
			windowRealmsRef.current.get(windowId) ?? null,
		bridge: dragBridge,
		activate: activateInWindow,
		commit: commitDrop,
		prewarm: prewarmMove,
		cancelPrewarm: cancelPrewarmMove,
		dropClassName: workspaceStyles.dropOverlay ?? "",
		ghostClassName: workspaceStyles.tabGhost ?? "",
	};
	if (!dragControllerRef.current) {
		dragControllerRef.current = new TabDragController(dragConfig);
	} else {
		dragControllerRef.current.setConfig(dragConfig);
	}
	const dragController = dragControllerRef.current;

	const reopenClosed = (
		targetWindowId: WindowId = activeWindowIdRef.current,
	): void => {
		const result = closedStackRef.current.materialize(
			(id) => windowOfView(workspaceRef.current, id) !== null,
			(id) =>
				isStructurallyValidViewId(id) && isValidViewId(id, assets),
		);
		if (!result) {
			return;
		}
		closedStackRef.current = result.next;
		const { record } = result;
		if (record.kind === "view") {
			const target = getWindow(workspaceRef.current, record.windowId)
				? record.windowId
				: targetWindowId;
			openView(record.viewId, target);
			return;
		}
		// Resurrect the whole window at its original id, so main restores its
		// persisted geometry when the satellite manager reopens it; the layout is
		// already pruned of dead/reopened/transient views by materialize.
		updateWorkspace((ws) => ({
			...ws,
			windows: [...ws.windows, record.layout],
		}));
		markActive(record.layout.id, record.layout.focused);
	};

	const openAsset = (url: string): void => {
		const entry = assets.find((a) => a.url === url);
		if (entry) {
			openView(assetViewId(entry));
		}
	};

	const openAssetFile = (entry: DirEntry): void => {
		if (entry.isDirectory || !assetsRoot) {
			return;
		}
		const norm = (value: string) => value.replace(/\\/g, "/");
		const rootNorm = norm(assetsRoot);
		const pathNorm = norm(entry.path);
		if (pathNorm.startsWith(`${rootNorm}/`)) {
			openAsset(
				`/src/game/content/assets/${pathNorm.slice(rootNorm.length + 1)}`,
			);
		}
	};

	const newAudio = (): void => {
		openView(NEW_AUDIO_VIEW);
	};

	const startNewSprite = (isTileset: boolean): void => {
		setNewSpriteKind({
			isTileset,
			windowId:
				windowOfView(
					workspaceRef.current,
					makeViewId("asset-browser"),
				) ?? activeWindowIdRef.current,
		});
	};

	const confirmNewSprite = (config: NewSpriteConfig): void => {
		const target =
			newSpriteKind?.windowId ?? activeWindowIdRef.current;
		setCreateConfig({
			...config,
			isTileset: newSpriteKind?.isTileset ?? false,
		});
		setNewSpriteKind(null);
		openView(NEW_SPRITE_VIEW, target);
	};

	const assetActions: AssetCreateActions = {
		onNewSprite: () => startNewSprite(false),
		onNewTileset: () => startNewSprite(true),
		onNewAudio: newAudio,
	};

	const onAssetCreated = (url: string): void => {
		const name = assetFilename(url);
		const ext = name.split(".").toSpliced(0, 1).join(".");
		const lower = name.toLowerCase();
		const entry = {
			name,
			url,
			ext,
			isPng: lower.endsWith(".png"),
			isAudio: /\.(wav|mp3|ogg)$/i.test(lower),
			isFont: isFontName(name),
			isTileset: isTilesetName(name),
		};
		setAssets((prev) =>
			prev.some((a) => a.url === url)
				? prev
				: [...prev, entry]
						.sort((a, b) => a.name.localeCompare(b.name))
						.sort((a, b) => a.ext.localeCompare(b.ext)),
		);
		removeViewNow(entry.isAudio ? NEW_AUDIO_VIEW : NEW_SPRITE_VIEW);
		openView(assetViewId(entry));
		setCreateConfig(null);
	};

	const assetIsTileset = (url: string): boolean => {
		const entry = assets.find((a) => a.url === url);
		return entry ? entry.isTileset : isTilesetName(url);
	};

	const isTilesetView = (id: ViewId): boolean => {
		const { param } = parseViewId(id);
		return !!param && param !== NEW_PARAM && assetIsTileset(param);
	};

	const openScene = (sceneId: string): void => {
		openView(`scene:${sceneId}`);
	};

	const selectEntities = (
		sceneId: string,
		ids: ReadonlyArray<EntityId>,
	): void => {
		openScene(sceneId);
		projectRef.current?.store(sceneId).select(ids);
	};

	const selectWorld = (sceneId: string): void => {
		openScene(sceneId);
		projectRef.current?.store(sceneId).inspectWorld();
	};

	useEffect(() => {
		if (!selectedEntity && !inspectingWorld) {
			return;
		}
		const ws = workspaceRef.current;
		if (windowOfView(ws, "inspector")) {
			return;
		}
		const targetId =
			(activeSceneId && windowOfView(ws, activeSceneId)) ??
			activeWindowIdRef.current;
		const window = getWindow(ws, targetId) ?? hubOf(ws);
		const anchor = anchorView(window);
		const anchorPath = anchor ? findView(window.root, anchor) : null;
		const root = anchorPath
			? insertView(window.root, "inspector", anchorPath, "right")
			: window.root;
		updateWorkspace(
			updateWindow(ws, window.id, (w) => ({ ...w, root })),
		);
	}, [selectedEntity, inspectingWorld]);

	const playGame = (): void => {
		void launchPlaytest().catch(() =>
			toastError("Couldn't launch the game"),
		);
	};

	const onRunChange = useCallback((): void => {
		const host = runHostRef.current;
		setRunMode(host ? host.inputMode : "game");
		setRunFrozen(host ? host.frozen : false);
	}, []);

	const focusRunView = (): void => {
		runHostRef.current?.view.viewport.element.focus();
	};

	const openDocumentFor = (sceneId: string): SceneDocument | null => {
		const project = projectRef.current;
		return project?.hasDocument(sceneId)
			? project.document(sceneId)
			: null;
	};

	const ensureDocumentFor = (sceneId: string): SceneDocument =>
		projectRef.current!.document(sceneId);

	/**
	 * The active window's scene view — the target for document-scoped commands.
	 * Prefers the window's last-interacted scene view, falling back to its first
	 * scene view; `null` when the invoking window hosts no scene view (commands
	 * then no-op, plan A2).
	 */
	const commandSceneViewId = (): ViewId | null => {
		const window =
			getWindow(workspaceRef.current, activeWindowIdRef.current) ??
			hubOf(workspaceRef.current);
		return resolveCommandSceneView(
			window,
			activeSceneByWindowRef.current.get(window.id),
		);
	};

	const commandSceneView = (): SceneView | null => {
		const id = commandSceneViewId();
		return id ? (sceneViewsRef.current.get(id) ?? null) : null;
	};

	const startRun = (): void => {
		const instance = gameRef.current;
		if (runHostRef.current || !instance) {
			return;
		}
		const activeId = commandSceneViewId();
		const view = activeId
			? (sceneViewsRef.current.get(activeId) ?? null)
			: null;
		const sceneId = activeId ? parseViewId(activeId).param : null;
		if (!view || !activeId || !sceneId) {
			return;
		}
		const gameModule = gameModuleRef.current;
		gameUiRef.current ??= gameModule.createGameUi(instance.services);
		runHostRef.current = new RunHost(view, {
			gameModule,
			services: instance.services,
			settings: instance.services.settings,
			actions: view.scene.actions ?? NULL_ACTIONS,
			gameUi: gameUiRef.current,
			startSceneId: sceneId,
			openDocument: openDocumentFor,
			ensureDocument: ensureDocumentFor,
			onActiveSceneChange: () => {},
			onChange: onRunChange,
		});
		setRunning(true);
		setRunMode("game");
		setRunningWindowId(
			windowOfView(workspaceRef.current, activeId) ?? HUB_WINDOW_ID,
		);
		requestAnimationFrame(focusRunView);
	};

	const stopRun = (): void => {
		const host = runHostRef.current;
		if (!host) {
			return;
		}
		runHostRef.current = null;
		host.stop();
		setRunning(false);
		setRunMode("game");
		setRunFrozen(false);
		setRunningWindowId(null);
	};

	const setRunInputMode = (mode: "game" | "editor"): void => {
		const host = runHostRef.current;
		if (!host) {
			return;
		}
		host.setMode(mode);
		if (host.inputMode === "game") {
			requestAnimationFrame(focusRunView);
		}
	};

	const toggleRunMode = (): void => {
		const host = runHostRef.current;
		if (!host) {
			return;
		}
		host.toggleMode();
		if (host.inputMode === "game") {
			requestAnimationFrame(focusRunView);
		}
	};

	const toggleRunFreeze = (): void => {
		runHostRef.current?.toggleFreeze();
	};

	const stepRun = (): void => {
		runHostRef.current?.step();
	};

	const stopWindowLoop = (windowId: WindowId): void => {
		windowLoopsRef.current.get(windowId)?.();
		windowLoopsRef.current.delete(windowId);
	};

	/**
	 * Step and render exactly the scene views hosted by `windowId`, on that
	 * window's own `requestAnimationFrame` and {@link Clock} (plan D1). Satellites
	 * keep stepping while the hub is minimized because each loop runs on its own
	 * window. Perf timestamps are normalized to the hub's `timeOrigin`.
	 *
	 * While a run is active it renders **only in its anchor view**, stepped once
	 * by the window hosting that anchor; every other scene view (in any window) is
	 * frozen — neither stepped nor re-rendered — so one run is the whole editor's
	 * focus (plan lines 146-149). The sim advance is skipped while a dirty-guard
	 * dialog is open, though the anchor keeps drawing its frozen frame (line 151).
	 */
	const startWindowLoop = (windowId: WindowId, win: Window): void => {
		stopWindowLoop(windowId);
		const unregisterRealm = audioFocus.registerRealm(win);
		const clock = new Clock();
		let last = 0;
		let raf = 0;
		let first = true;
		const originOffset =
			win.performance.timeOrigin - performance.timeOrigin;
		const frame = (time = last): void => {
			if (win.closed) {
				windowLoopsRef.current.delete(windowId);
				return;
			}
			let dt = (time - last) as Milliseconds;
			if (first) {
				dt = 0 as Milliseconds;
				first = false;
			} else if (dt > MAX_FRAME_MS) {
				dt = MAX_FRAME_MS;
			} else if (dt < 0) {
				dt = 0 as Milliseconds;
			}
			clock.advance(dt);
			const now = clock.snapshot(dt);
			const fps = dt > 0 ? 1000 / dt : 0;
			const g = gameRef.current;
			if (g) {
				const wl = getWindow(workspaceRef.current, windowId);
				const host = runHostRef.current;
				const isRunAnchorWindow = host
					? windowOfView(workspaceRef.current, host.view.id) ===
						windowId
					: false;
				if (host && isRunAnchorWindow && !isGuardDialogOpen()) {
					host.frame(dt, now);
				}
				const heap = usedHeapBytes();
				const focusedId = wl?.focused ?? null;
				const audibleView =
					host && isRunAnchorWindow
						? host.view.id
						: focusedId && isSceneView(focusedId)
							? focusedId
							: null;
				audioFocus.setRealmOwner(win, audibleView);
				if (wl) {
					for (const viewId of allViewIds(wl.root)) {
						if (!isSceneView(viewId)) {
							continue;
						}
						const view = sceneViewsRef.current.get(viewId);
						if (!view) {
							continue;
						}
						// One run at a time: every scene view but the anchor is frozen
						// while a run is active — no step, no re-render (plan line 148).
						if (host && view !== host.view) {
							continue;
						}
						const viewBefore = performance.now();
						let updateSpan: number;
						if (host) {
							view.renderRunWorld(host.world, now);
							updateSpan = host.world.profile.updateSpanMs;
						} else {
							if (viewId === focusedId) {
								view.update(dt, now);
							} else {
								view.rollInput();
							}
							view.render(now);
							updateSpan = view.scene.world.profile.updateSpanMs;
						}
						view.frameTime = performance.now() - viewBefore;
						view.fps = fps;
						view.perf.push({
							frametime: view.frameTime,
							update: updateSpan,
							heap,
							fps,
							now: time + originOffset,
						});
					}
				}
				if (host && isRunAnchorWindow) {
					host.endFrame();
				} else if (!host && focusedId && isSceneView(focusedId)) {
					sceneViewsRef.current
						.get(focusedId)
						?.scene.world.events.clear();
				}
				if (windowId === HUB_WINDOW_ID) {
					g.events.clear();
				}
			}
			last = time;
			raf = win.requestAnimationFrame(frame);
		};
		raf = win.requestAnimationFrame(frame);
		windowLoopsRef.current.set(windowId, () => {
			unregisterRealm();
			win.cancelAnimationFrame(raf);
		});
	};

	useEffect(() => {
		let cancelled = false;
		let stop: (() => void) | null = null;

		void runtimeReady.then(() => {
			if (cancelled) {
				return;
			}
			gameRef.current = null;
			const instance = createGame(startScene);
			gameRef.current = instance;
			projectRef.current = new Project(instance.services, {
				[startScene]: instance.scene!,
			});
			setGame(instance);
			gameReadyRef.current!.resolve();

			stop = () => {
				for (const id of sceneViewsRef.current.keys()) {
					disposeSceneView(id);
				}
				instance.stop();
				gameRef.current = null;
				projectRef.current = null;
				let resolve!: () => void;
				const promise = new Promise<void>((r) => {
					resolve = r;
				});
				gameReadyRef.current = { promise, resolve };
				setGame(null);
			};
		});

		return () => {
			cancelled = true;
			stop?.();
		};
	}, [startScene, runtimeReady]);

	// The hub loop runs on the main window and lives for the app's lifetime;
	// satellite loops start/stop with their windows (see the satellite manager).
	useEffect(() => {
		startWindowLoop(HUB_WINDOW_ID, window);
		const loops = windowLoopsRef.current;
		return () => {
			for (const stop of loops.values()) {
				stop();
			}
			loops.clear();
		};
	}, []);

	// Stop the frame loop of any window that has left the workspace (a collapsed
	// satellite, an OS-closed window), so a loop never targets a dead window.
	useEffect(() => {
		const live = new Set(workspace.windows.map((w) => w.id));
		const dead: WindowId[] = [];
		for (const id of windowLoopsRef.current.keys()) {
			if (!live.has(id)) {
				dead.push(id);
			}
		}
		for (const id of dead) {
			stopWindowLoop(id);
		}
	}, [workspace]);

	// Flush the debounced workspace synchronously before a reload/close so the
	// last layout mutation is never dropped (plan B2), and block a reload/HMR
	// full-reload while any document is dirty. The DOM guard cannot run during
	// unload, so this native beforeunload + Electron will-prevent-unload keeps the
	// page loaded (plan lines 100-107); the page stays put until the edits are
	// saved or discarded. Satellites carry no Vite client, so HMR never reloads
	// them; a satellite's own Ctrl+R is blocked in main.
	useEffect(() => {
		const onBeforeUnload = (event: BeforeUnloadEvent): void => {
			flushWorkspace();
			if (dirtyViewsRef.current.size > 0) {
				event.preventDefault();
				event.returnValue = "";
			}
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () =>
			window.removeEventListener("beforeunload", onBeforeUnload);
	}, []);

	// Bridge main's native window-close requests (title-bar X, app quit) into the
	// shared-heap DOM guard. Main intercepts the OS close and messages the hub
	// realm with the target window id; the hub runs the guard (rendering the
	// dialog into that window) and replies via `allowClose` when the close may
	// proceed. Registered only in the hub realm — the sole owner of dirty state.
	useEffect(() => {
		return windowControls()?.onCloseRequested(requestWindowClose);
	}, []);

	// Publish whether any guard dialog is open so the frame loops can pause the
	// sim while one is up (plan line 151; consumed by the WS-F run worker).
	useEffect(() => {
		setGuardDialogOpen(guards.size > 0);
	}, [guards]);

	// Boot: resolve the asset root + listing, then prune asset views against the
	// real list (fixes the boot-prune bug where views were dropped against an
	// empty initial list, plan B4).
	useEffect(() => {
		if (!isDesktop()) {
			return;
		}
		void getAssetsRoot().then(setAssetsRoot);
		void listAssetsDeep().then((entries) => {
			setAssets(entries);
			updateWorkspace((ws) => pruneAssetViews(ws, entries));
		});
	}, []);

	useEffect(() => {
		if (!game) {
			return;
		}
		updateWorkspace((ws) =>
			pruneWorkspace(
				ws,
				(id) => !isSceneView(id) || isValidViewId(id, []),
			),
		);
	}, [game]);

	/**
	 * Editing is enabled in a window unless a game-input run is anchored there.
	 * Per-window so a run in one window never disables editing in another (plan
	 * A2).
	 */
	const editorEnabledForWindow = (windowId: WindowId): boolean =>
		!running || runMode === "editor" || runningWindowId !== windowId;

	const editorEnabled = !running || runMode === "editor";

	const deps: MenuDeps | null = focusedSceneView
		? {
				ecs: focusedSceneView.scene.ecs,
				document: focusedSceneView.document,
				requestAddComponent: (entity) =>
					setAddTarget({
						entity,
						windowId:
							windowOfView(
								workspaceRef.current,
								makeViewId("tree"),
							) ?? activeWindowIdRef.current,
					}),
				select: (entity) =>
					entity
						? focusedSceneView.store.selectOne(entity)
						: focusedSceneView.store.clear(),
			}
		: null;

	const renderTree = () =>
		game && projectRef.current ? (
			<ProjectTree
				summaries={projectRef.current.summaries}
				focusedSceneId={focusedSceneId}
				loadedScene={(id) => projectRef.current?.loaded(id) ?? null}
				ensureScene={(id) => {
					projectRef.current?.scene(id);
				}}
				storeFor={(id) => projectRef.current?.store(id) ?? null}
				focusedStore={focusedStore}
				deps={deps}
				onOpenScene={openScene}
				onSelectEntities={selectEntities}
				onSelectWorld={selectWorld}
			/>
		) : null;

	const renderInspector = () => {
		if (focusedScene && focusedSceneView && inspectingWorld) {
			return (
				<div
					className={clsx(
						styles.inspectorHost,
						!editorEnabled && styles.disabled,
					)}
				>
					<SceneConfigInspector
						scene={focusedScene}
						doc={focusedSceneView.document}
					/>
				</div>
			);
		}
		if (
			focusedScene &&
			focusedSceneView &&
			selectedEntity &&
			selectionChannelRef.current
		) {
			const runtime = !!(
				running &&
				runHostRef.current?.view === focusedSceneView &&
				runHostRef.current.isRuntimeEntity(selectedEntity)
			);
			return (
				<div
					className={clsx(
						styles.inspectorHost,
						!editorEnabled && styles.disabled,
					)}
				>
					<Inspector
						channel={selectionChannelRef.current}
						runtime={runtime}
					/>
				</div>
			);
		}
		return <div className={styles.placeholder}>Nothing selected</div>;
	};

	const renderConsole = () => <ConsoleView />;

	const resolveActiveProfile =
		useCallback((): FrameProfile | null => {
			const view = focusedSceneViewRef.current;
			if (!view) {
				return null;
			}
			const host = runHostRef.current;
			if (
				host &&
				(view === host.view ||
					parseViewId(view.id).param === host.activeScene)
			) {
				return host.world.profile;
			}
			return view.scene.world.profile;
		}, []);

	const renderProfiler = () => (
		<ProfilerView resolveProfile={resolveActiveProfile} />
	);

	const renderAssetBrowser = () =>
		assetsRoot ? (
			<AssetBrowser
				root={assetsRoot}
				history={assetBrowserHistoryRef.current}
				assetActions={assetActions}
				onOpenFile={openAssetFile}
			/>
		) : null;

	const renderSprite = (id: ViewId, param: string, active: boolean) =>
		param === NEW_PARAM ? (
			<SpriteEditor
				assetUrl={null}
				isTileset={createConfig?.isTileset ?? false}
				create={createConfig}
				onDirty={(d) => setViewDirty(id, d)}
				onCreated={onAssetCreated}
				active={active}
			/>
		) : (
			<SpriteEditor
				assetUrl={param}
				isTileset={assetIsTileset(param)}
				create={null}
				onDirty={(d) => setViewDirty(id, d)}
				onCreated={onAssetCreated}
				active={active}
			/>
		);

	const renderScene = (id: ViewId, windowLayout: WindowLayout) => {
		const view = ensureSceneView(id);
		if (!view) {
			return null;
		}
		const muted = isViewMuted(workspace, id);
		const anchorViewId = running
			? (runHostRef.current?.view.id ?? null)
			: null;
		const isAnchor =
			anchorViewId !== null && view.id === anchorViewId;
		// One run at a time: any scene view that is not the run's anchor is locked
		// out while a run is active — frozen, darkened, and inert (plan line 147).
		const lockedOut = isSceneLockedOut(anchorViewId, view.id);
		const windowEnabled =
			editorEnabledForWindow(windowLayout.id) && !lockedOut;
		return (
			<SceneViewPanel
				view={view}
				onRun={startRun}
				onStop={stopRun}
				onToggleFreeze={toggleRunFreeze}
				onStep={stepRun}
				onSetMode={setRunInputMode}
				inputMode={runMode}
				frozen={runFrozen}
				running={isAnchor}
				lockedOut={lockedOut}
				editorEnabled={windowEnabled}
				requestAddComponent={(entity) =>
					setAddTarget({ entity, windowId: windowLayout.id })
				}
				undoShortcut={UNDO_SHORTCUT}
				redoShortcut={REDO_SHORTCUT}
				muted={muted}
				onMutedChange={(next) => setSceneViewMuted(id, next)}
			/>
		);
	};

	/**
	 * Wrap a runtime-dependent view so it suspends on {@link gameReadyRef} until
	 * the game runtime exists, sharing the {@link Loading} fallback with the lazy
	 * panel chunks (which suspend on the same boundary once rendered). The body is
	 * a thunk so its runtime-dependent JSX is only built once the runtime is ready.
	 */
	const runtimeView = (render: () => ReactNode) => (
		<Suspense fallback={<Loading label="Loading runtime…" />}>
			<RuntimeSuspender ready={gameReadyRef.current!.promise}>
				{render}
			</RuntimeSuspender>
		</Suspense>
	);

	/** Wrap a lazy-only view (needs no runtime): suspend on the panel chunk. */
	const lazyView = (element: ReactNode) => (
		<Suspense fallback={<Loading />}>{element}</Suspense>
	);

	const renderView = (id: ViewId, windowLayout: WindowLayout) => {
		const { kind, param } = parseViewId(id);
		const active = windowLayout.focused === id;
		switch (kind) {
			case "tree":
				return renderTree();
			case "inspector":
				return renderInspector();
			case "asset-browser":
				return renderAssetBrowser();
			case "console":
				return renderConsole();
			case "profiler":
				return renderProfiler();
			case "scene":
				return runtimeView(() => renderScene(id, windowLayout));
			case "font":
				return runtimeView(() => {
					const g = gameRef.current;
					return g && param ? (
						<FontPreview
							assetUrl={param}
							assetManager={g.assetManager}
						/>
					) : null;
				});
			case "audio":
				return runtimeView(() => {
					const g = gameRef.current;
					return g ? (
						<AudioEditor
							assetUrl={param === NEW_PARAM ? null : param}
							onDirty={(d) => setViewDirty(id, d)}
							audio={g.audio}
							onCreated={onAssetCreated}
							active={active}
						/>
					) : null;
				});
			case "sprite":
				return lazyView(renderSprite(id, param ?? "", active));
			default:
				return null;
		}
	};

	/**
	 * App-level hotkey operations, threaded into each window's {@link WindowHotkeys}
	 * so the listeners bind to that window's own `document`. The methods read live
	 * state through refs, so binding fresh callbacks per render is safe; the
	 * window-scoped queries take the registering window's id.
	 */
	const hotkeyHandlers: WindowHotkeyHandlers = {
		assetFocusedIn,
		windowFocusedView,
		commandSceneView,
		commandSceneViewId,
		toggleRunMode,
		stepRun,
		startRun,
		stopRun,
		toggleRunFreeze,
		playGame,
		closeView,
		reopenClosed,
		saveScene,
		undoAssetBrowser: () => assetBrowserHistoryRef.current.undo(),
		redoAssetBrowser: () => assetBrowserHistoryRef.current.redo(),
	};

	/**
	 * Every dialog owned by `windowId`, rendered inside that window's shell (via
	 * its providers) so each appears in the window where it was triggered rather
	 * than being pinned to the hub (plan line 161). Each app-global dialog carries
	 * the id of its triggering window and shows only in the matching shell:
	 *
	 * - the dirty-guard (Keep editing / Discard) — raised by a window/app close;
	 * - the add-component picker — raised from a scene view's or the tree's entity
	 *   context menu;
	 * - the new-sprite dialog — raised from the asset browser's create actions.
	 *
	 * One instance of each is live at a time; it renders in its triggering window.
	 */
	const dialogsFor = (windowId: WindowId): ReactNode => {
		const guard = guards.get(windowId) ?? null;
		return (
			<>
				<KeepEditingDialog
					open={!!guard}
					docs={guard?.docs ?? []}
					onKeepEditing={() => resolveGuard(windowId)}
					onDiscard={() => {
						const request = guards.get(windowId);
						resolveGuard(windowId);
						request?.onDiscard();
					}}
				/>
				{addTarget?.windowId === windowId && deps && (
					<AddComponentPicker
						entity={addTarget.entity}
						deps={deps}
						onClose={() => setAddTarget(null)}
					/>
				)}
				<NewSpriteDialog
					open={newSpriteKind?.windowId === windowId}
					isTileset={newSpriteKind?.isTileset ?? false}
					onConfirm={confirmNewSprite}
					onClose={() => setNewSpriteKind(null)}
				/>
			</>
		);
	};

	/**
	 * Build the full shell tree for a window against its own document/window.
	 * Every window hosts its own dialogs via {@link dialogsFor}, so a dialog
	 * renders in the window that triggered it. Returns `null` if the window has
	 * been removed (e.g. a satellite mid-teardown).
	 */
	const renderShell = (
		windowId: WindowId,
		doc: Document,
		win: Window,
	): ReactNode => {
		const windowLayout = getWindow(workspace, windowId);
		if (!windowLayout) {
			return null;
		}
		return (
			<TabDragContext.Provider value={dragController}>
				<WindowShell
					windowId={windowId}
					doc={doc}
					win={win}
					assetManager={game?.assetManager ?? null}
					windowLayout={windowLayout}
					onChange={(next) => onWindowChange(windowId, next)}
					renderView={(id) => renderView(id, windowLayout)}
					onOpenView={(id) => openView(id, windowId)}
					onCloseView={closeView}
					onMoveToNewWindow={moveToNewWindow}
					dirtyViews={dirtyViews}
					isTilesetView={isTilesetView}
					onSplitDragStart={() =>
						setWindowResizeSuspended(windowId, true)
					}
					onSplitDragEnd={() =>
						setWindowResizeSuspended(windowId, false)
					}
					viewBarState={(kind) =>
						viewBarState(workspace, kind, windowId)
					}
					onPlaytest={playGame}
					playtestPhase={playtestPhase}
					windowFocused={windowId === activeWindowId}
					showTitleBar={isDesktop()}
				>
					{dialogsFor(windowId)}
					<WindowHotkeys
						windowId={windowId}
						running={running}
						editorEnabled={editorEnabledForWindow(windowId)}
						handlers={hotkeyHandlers}
					/>
				</WindowShell>
			</TabDragContext.Provider>
		);
	};

	useSatelliteWindows({
		satelliteIds: workspace.windows
			.filter((w) => w.id !== HUB_WINDOW_ID)
			.map((w) => w.id),
		renderShell: (windowId, doc, win) =>
			renderShell(windowId, doc, win),
		onOpened: (windowId, win) => {
			windowRealmsRef.current.set(windowId, {
				doc: win.document,
				win,
			});
			startWindowLoop(windowId, win);
		},
		onClosed: (windowId) => {
			windowRealmsRef.current.delete(windowId);
			stopWindowLoop(windowId);
			resolveGuard(windowId);
			const ws = workspaceRef.current;
			const window = getWindow(ws, windowId);
			if (!window) {
				return;
			}
			updateWorkspace({
				...ws,
				windows: ws.windows.filter((w) => w.id !== windowId),
			});
			// Record the closed window with its real screen geometry (main owns
			// bounds, keyed by window id) so mod+shift+t resurrects it in place.
			const push = (bounds: WindowBounds): void => {
				closedStackRef.current = closedStackRef.current.pushWindow(
					bounds,
					window,
				);
			};
			const bridge = windowManifestBridge();
			if (bridge) {
				void bridge
					.read()
					.then((manifest) =>
						push(manifest.windows[windowId]?.bounds ?? ZERO_BOUNDS),
					);
			} else {
				push(ZERO_BOUNDS);
			}
		},
	});

	return renderShell(HUB_WINDOW_ID, document, window);
};

export default App;
