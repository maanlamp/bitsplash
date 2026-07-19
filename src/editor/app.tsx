import { IconContext } from "@phosphor-icons/react";
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
} from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Clock } from "../engine/clock";
import type { Milliseconds } from "../engine/duration";
import type { EntityId } from "../engine/ecs";
import type { Game } from "../engine/game";
import { NULL_ACTIONS } from "../engine/input/bindings/action-provider";
import type { FrameProfile } from "../engine/profiling/frame-profile";
import type { GameModule } from "../engine/runtime/game-module";
import { createGame } from "../engine/scene/registry";
import { TILE_SIZE } from "../engine/tilemap/tile";
import type { DirEntry } from "../project-rpc";
import { ActiveScene } from "./active-scene";
import styles from "./app.module.scss";
import { AssetBrowser } from "./asset-browser/asset-browser";
import { type AssetCreateActions } from "./asset-context-menu";
import { AssetManagerProvider } from "./asset-manager-context";
import {
	type AssetEntry,
	assetFilename,
	isFontName,
	isTilesetName,
} from "./assets";
import {
	deleteEntities,
	duplicateEntities,
	nudgeEntities,
} from "./commands";
import ConfirmDialog from "./confirm-dialog";
import Console from "./console/console";
import { DebugFlags } from "./debug-flags";
import { editorSettings } from "./editor-settings";
import {
	AddComponentPicker,
	type MenuDeps,
} from "./entity-context-menu";
import { History } from "./history";
import Inspector, {
	SceneConfigInspector,
} from "./inspector/inspector";
import "./inspector/register-renderers";
import Loading from "./loading";
import { MODES } from "./modes";
import { usedHeapBytes } from "./perf/heap";
import ProfilerView from "./profiler/profiler-view";
import { Project } from "./project";
import {
	getAssetsRoot,
	isDesktop,
	launchGameWindow,
	listAssetsDeep,
	saveLevel,
} from "./project-io";
import ProjectTree from "./project-tree";
import "./register-drops";
import { RunHost } from "./run-host";
import type { SceneDocument } from "./scene-document";
import { SceneView } from "./scene-view";
import SceneViewPanel from "./scene-view-panel";
import { SelectionChannel } from "./selection-channel";
import NewSpriteDialog from "./sprite/new-sprite-dialog";
import type { NewSpriteConfig } from "./sprite/sprite-editor";
import TitleBar from "./title-bar";
import { Toaster } from "./toaster";
import {
	allViewIds,
	findView,
	insertView,
	removeView,
	setActive,
	type ViewId,
	type Workspace as WorkspaceState,
} from "./workspace/layout";
import { loadWorkspace, saveWorkspace } from "./workspace/persist";
import ViewBar from "./workspace/view-bar";
import {
	assetViewId,
	isAssetView,
	isLegacyMultiViewId,
	isSceneView,
	isValidViewId,
	NEW_PARAM,
	parseViewId,
} from "./workspace/view-registry";
import Workspace from "./workspace/workspace";

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

const NUDGE_DELTAS: Readonly<
	Record<string, Readonly<{ x: number; y: number }>>
> = {
	up: { x: 0, y: -1 },
	down: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
};

const firstSceneView = (workspace: WorkspaceState): ViewId | null =>
	allViewIds(workspace.root).find(isSceneView) ?? null;

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
	const [addTarget, setAddTarget] = useState<EntityId | null>(null);
	const [running, setRunning] = useState(false);
	const [runMode, setRunMode] = useState<"game" | "editor">("game");
	const [runPaused, setRunPaused] = useState(false);
	const [, forceStore] = useReducer((n: number) => n + 1, 0);
	const [assets, setAssets] = useState<ReadonlyArray<AssetEntry>>([]);
	const [assetsRoot, setAssetsRoot] = useState<string | null>(null);
	const assetBrowserHistoryRef = useRef(new History());
	const [activeSceneViewId, setActiveSceneViewId] =
		useState<ViewId | null>(null);
	const [workspace, setWorkspace] = useState<WorkspaceState>(() =>
		loadWorkspace(
			(id) =>
				(isSceneView(id) && !isLegacyMultiViewId(id)) ||
				isValidViewId(id, assets),
			`scene:${startScene}`,
		),
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
	const closedStackRef = useRef<ViewId[]>([]);
	const focusedSceneViewRef = useRef<SceneView | null>(null);
	const activeSceneIdRef = useRef<ViewId | null>(null);
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

	const focusedView = workspace.focused;
	const focusedViewRef = useRef<ViewId | null>(focusedView);
	useEffect(() => {
		focusedViewRef.current = focusedView;
		if (focusedView && isSceneView(focusedView)) {
			setActiveSceneViewId(focusedView);
		}
	}, [focusedView]);

	useEffect(() => {
		if (isDesktop()) {
			void getAssetsRoot().then(setAssetsRoot);
			void listAssetsDeep().then(setAssets);
		}
	}, []);

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
		sceneViewsRef.current.set(id, view);
		return view;
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
		for (const id of allViewIds(workspace.root)) {
			if (isSceneView(id)) {
				ensureSceneView(id);
			}
		}
	}

	const activeSceneId =
		activeSceneViewId && findView(workspace.root, activeSceneViewId)
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
		activeSceneIdRef.current = activeSceneId;
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
			allViewIds(workspace.root).filter(isSceneView),
		);
		for (const id of sceneViewsRef.current.keys()) {
			if (!open.has(id)) {
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

	const assetFocused = (): boolean => {
		const id = focusedViewRef.current;
		return !!id && isAssetView(id);
	};

	const [newSpriteKind, setNewSpriteKind] = useState<Readonly<{
		isTileset: boolean;
	}> | null>(null);
	const [createConfig, setCreateConfig] = useState<
		(NewSpriteConfig & Readonly<{ isTileset: boolean }>) | null
	>(null);
	const [pendingDiscard, setPendingDiscard] = useState<
		(() => void) | null
	>(null);

	const [dirtyViews, setDirtyViews] = useState<ReadonlySet<ViewId>>(
		() => new Set(),
	);
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
	 * any view clears the marker on all of them.
	 */
	const setSceneDirty = (sceneId: string, dirty: boolean): void => {
		setDirtyViews((prev) => {
			const next = new Set(prev);
			let changed = false;
			for (const id of allViewIds(workspaceRef.current.root)) {
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

	const anchorView = (ws: WorkspaceState): ViewId | null => {
		if (
			focusedViewRef.current &&
			isSceneView(focusedViewRef.current)
		) {
			return focusedViewRef.current;
		}
		return firstSceneView(ws) ?? ws.focused;
	};

	const openView = (id: ViewId): void => {
		const ws = workspaceRef.current;
		if (findView(ws.root, id)) {
			updateWorkspace({
				...ws,
				root: setActive(ws.root, id),
				focused: id,
			});
			return;
		}
		const anchor = anchorView(ws);
		const anchorPath = anchor ? findView(ws.root, anchor) : null;
		const root = anchorPath
			? insertView(ws.root, id, anchorPath, "center")
			: ws.root;
		updateWorkspace({ ...ws, root, focused: id });
	};

	const removeViewNow = (id: ViewId): void => {
		const ws = workspaceRef.current;
		let root = removeView(ws.root, id);
		setViewDirty(id, false);
		const nextFocus =
			firstSceneView({ ...ws, root }) ?? allViewIds(root)[0] ?? null;
		if (nextFocus) {
			root = setActive(root, nextFocus);
		}
		updateWorkspace({ ...ws, root, focused: nextFocus });
	};

	const recordClosed = (id: ViewId): void => {
		if (id === NEW_SPRITE_VIEW || id === NEW_AUDIO_VIEW) {
			return;
		}
		closedStackRef.current.push(id);
	};

	const discardView = (id: ViewId): void => {
		if (isSceneView(id)) {
			sceneViewsRef.current.get(id)?.document.revert();
		}
		recordClosed(id);
		removeViewNow(id);
	};

	const sceneViewCount = (sceneId: string): number =>
		allViewIds(workspaceRef.current.root).filter(
			(v) => isSceneView(v) && parseViewId(v).param === sceneId,
		).length;

	const closeView = (id: ViewId): void => {
		const sceneId = isSceneView(id) ? parseViewId(id).param : null;
		if (sceneId && sceneViewCount(sceneId) > 1) {
			recordClosed(id);
			removeViewNow(id);
			return;
		}
		if (isViewDirty(id)) {
			setPendingDiscard(() => () => discardView(id));
		} else {
			recordClosed(id);
			removeViewNow(id);
		}
	};

	const reopenClosed = (): void => {
		const stack = closedStackRef.current;
		while (stack.length > 0) {
			const id = stack.pop()!;
			if (!findView(workspaceRef.current.root, id)) {
				openView(id);
				return;
			}
		}
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
		setNewSpriteKind({ isTileset });
	};

	const confirmNewSprite = (config: NewSpriteConfig): void => {
		setCreateConfig({
			...config,
			isTileset: newSpriteKind?.isTileset ?? false,
		});
		setNewSpriteKind(null);
		openView(NEW_SPRITE_VIEW);
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
		if (findView(ws.root, "inspector")) {
			return;
		}
		const anchor = anchorView(ws);
		const anchorPath = anchor ? findView(ws.root, anchor) : null;
		const root = anchorPath
			? insertView(ws.root, "inspector", anchorPath, "right")
			: ws.root;
		updateWorkspace({ ...ws, root });
	}, [selectedEntity, inspectingWorld]);

	const playGame = (): void => {
		void launchGameWindow();
	};

	const onRunChange = useCallback((): void => {
		const host = runHostRef.current;
		setRunMode(host ? host.inputMode : "game");
		setRunPaused(host ? host.paused : false);
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

	const startRun = (): void => {
		const instance = gameRef.current;
		if (runHostRef.current || !instance) {
			return;
		}
		const view = focusedSceneViewRef.current;
		const activeId = activeSceneIdRef.current;
		const sceneId = activeId ? parseViewId(activeId).param : null;
		if (!view || !sceneId) {
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
		setRunPaused(false);
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

	const toggleRunPause = (): void => {
		runHostRef.current?.togglePause();
	};

	const stepRun = (): void => {
		runHostRef.current?.step();
	};

	useEffect(() => {
		let cancelled = false;
		let raf = 0;
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

			const clock = new Clock();
			let last = 0;
			const frame = (time = last): void => {
				const dt = (time - last) as Milliseconds;
				clock.advance(dt);
				const now = clock.snapshot(dt);
				const fps = dt > 0 ? 1000 / dt : 0;
				const g = gameRef.current;
				if (g) {
					const focused = focusedSceneViewRef.current;
					const host = runHostRef.current;
					if (host) {
						host.frame(dt, now);
					}
					const heap = usedHeapBytes();
					for (const view of sceneViewsRef.current.values()) {
						const viewBefore = performance.now();
						const sceneId = parseViewId(view.id).param;
						const runBound =
							!!host &&
							(view === host.view || sceneId === host.activeScene);
						let updateSpan: number;
						if (host && runBound) {
							if (view !== host.view) {
								view.rollInput();
							}
							view.renderRunWorld(host.world, now);
							updateSpan = host.world.profile.updateSpanMs;
						} else {
							if (view === focused && !host) {
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
						});
					}
					if (host) {
						host.endFrame();
					} else {
						focused?.scene.world.events.clear();
					}
					g.events.clear();
				}
				last = time;
				raf = requestAnimationFrame(frame);
			};
			raf = requestAnimationFrame(frame);
			setGame(instance);
			gameReadyRef.current!.resolve();

			stop = () => {
				cancelAnimationFrame(raf);
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

	useEffect(() => {
		if (!game) {
			return;
		}
		const ws = workspaceRef.current;
		let root = ws.root;
		for (const id of allViewIds(root)) {
			if (isSceneView(id) && !isValidViewId(id, [])) {
				root = removeView(root, id);
			}
		}
		if (root === ws.root) {
			return;
		}
		const focused =
			ws.focused && findView(root, ws.focused)
				? ws.focused
				: (firstSceneView({ ...ws, root }) ??
					allViewIds(root)[0] ??
					null);
		updateWorkspace({ ...ws, root, focused });
	}, [game]);

	const editorEnabled = !running || runMode === "editor";
	const editorHotkeysEnabled = editorEnabled;

	useHotkeys(
		"tab",
		(event) => {
			event.preventDefault();
			toggleRunMode();
		},
		{ enabled: running, preventDefault: true },
	);
	useHotkeys(
		"period",
		() => {
			stepRun();
		},
		{ enabled: running },
	);
	useHotkeys(
		"r",
		() => {
			if (assetFocused()) {
				return;
			}
			stopRun();
		},
		{ enabled: running },
	);

	useHotkeys(
		MODES.map((m) => m.shortcut).join(","),
		(_event, handler) => {
			if (assetFocused()) {
				return;
			}
			const key = handler.keys?.[0];
			const target = MODES.find((m) => m.shortcut === key);
			if (target) {
				focusedSceneViewRef.current?.store.setMode(target.id);
			}
		},
		{ enabled: editorHotkeysEnabled },
	);
	useHotkeys(
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
	useHotkeys(
		"shift+p",
		() => {
			if (assetFocused()) {
				return;
			}
			playGame();
		},
		{ enabled: true },
	);
	useHotkeys(
		"escape",
		() => {
			const id = focusedViewRef.current;
			if (id && isAssetView(id)) {
				closeView(id);
				return;
			}
			focusedSceneViewRef.current?.store.clear();
		},
		{ enabled: editorHotkeysEnabled },
	);
	useHotkeys(
		"mod+a",
		(event) => {
			if (assetFocused()) {
				return;
			}
			event.preventDefault();
			const view = focusedSceneViewRef.current;
			if (view) {
				view.store.select(view.scene.ecs.entities());
			}
		},
		{ preventDefault: true, enabled: editorHotkeysEnabled },
	);
	useHotkeys(
		"mod+shift+a",
		(event) => {
			if (assetFocused()) {
				return;
			}
			event.preventDefault();
			const view = focusedSceneViewRef.current;
			if (view) {
				const current = view.store.selection.ids;
				view.store.select(
					view.scene.ecs.entities().filter((id) => !current.has(id)),
				);
			}
		},
		{ preventDefault: true, enabled: editorHotkeysEnabled },
	);
	useHotkeys(
		"delete,backspace",
		() => {
			const view = focusedSceneViewRef.current;
			const ids = view ? [...view.store.selection.ids] : [];
			if (assetFocused() || !view || ids.length === 0) {
				return;
			}
			deleteEntities(view.document, ids);
			view.store.clear();
		},
		{ enabled: editorHotkeysEnabled },
	);
	useHotkeys(
		"mod+d",
		(event) => {
			event.preventDefault();
			if (assetFocused()) {
				return;
			}
			const view = focusedSceneViewRef.current;
			const ids = view ? [...view.store.selection.ids] : [];
			if (view && ids.length > 0) {
				const copies = duplicateEntities(view.document, ids);
				if (copies.length > 0) {
					view.store.select(copies);
				}
			}
		},
		{ preventDefault: true, enabled: editorHotkeysEnabled },
	);
	const nudge = (
		event: KeyboardEvent,
		dirKey: string | undefined,
		step: number,
	): void => {
		if (assetFocused()) {
			return;
		}
		const delta = NUDGE_DELTAS[dirKey ?? ""];
		const view = focusedSceneViewRef.current;
		const ids = view ? [...view.store.selection.ids] : [];
		if (!delta || !view || ids.length === 0) {
			return;
		}
		event.preventDefault();
		nudgeEntities(view.document, ids, delta.x * step, delta.y * step);
	};
	useHotkeys(
		"up,down,left,right",
		(event, handler) => nudge(event, handler.keys?.[0], 1),
		{ preventDefault: false, enabled: editorHotkeysEnabled },
	);
	useHotkeys(
		"shift+up,shift+down,shift+left,shift+right",
		(event, handler) =>
			nudge(event, handler.keys?.[0], editorSettings.nudgeStep),
		{ preventDefault: false, enabled: editorHotkeysEnabled },
	);
	useHotkeys(
		"shift+mod+up,shift+mod+down,shift+mod+left,shift+mod+right",
		(event, handler) => nudge(event, handler.keys?.[0], TILE_SIZE),
		{ preventDefault: false, enabled: editorHotkeysEnabled },
	);
	useHotkeys(
		"mod+w",
		(event) => {
			event.preventDefault();
			const id = focusedViewRef.current;
			if (id) {
				closeView(id);
			}
		},
		{ preventDefault: true, enabled: editorHotkeysEnabled },
	);
	useHotkeys(
		"mod+shift+t",
		(event) => {
			event.preventDefault();
			reopenClosed();
		},
		{ preventDefault: true, enabled: editorHotkeysEnabled },
	);
	useHotkeys(
		"mod+s",
		(event) => {
			event.preventDefault();
			if (assetFocused()) {
				return;
			}
			const id = activeSceneIdRef.current;
			const view = focusedSceneViewRef.current;
			if (id && view) {
				const { param } = parseViewId(id);
				if (param) {
					void saveScene(param, view);
				}
			}
		},
		{
			preventDefault: true,
			enabled: editorHotkeysEnabled,
			enableOnFormTags: true,
		},
	);
	useHotkeys(
		"mod+z",
		(event) => {
			const id = focusedViewRef.current;
			if (id && parseViewId(id).kind === "asset-browser") {
				event.preventDefault();
				assetBrowserHistoryRef.current.undo();
				return;
			}
			if (assetFocused()) {
				return;
			}
			event.preventDefault();
			focusedSceneViewRef.current?.document.undo();
		},
		{
			preventDefault: true,
			enabled: editorHotkeysEnabled,
			enableOnFormTags: true,
		},
	);
	useHotkeys(
		"mod+y",
		(event) => {
			const id = focusedViewRef.current;
			if (id && parseViewId(id).kind === "asset-browser") {
				event.preventDefault();
				assetBrowserHistoryRef.current.redo();
				return;
			}
			if (assetFocused()) {
				return;
			}
			event.preventDefault();
			focusedSceneViewRef.current?.document.redo();
		},
		{
			preventDefault: true,
			enabled: editorHotkeysEnabled,
			enableOnFormTags: true,
		},
	);

	const deps: MenuDeps | null = focusedSceneView
		? {
				ecs: focusedSceneView.scene.ecs,
				document: focusedSceneView.document,
				requestAddComponent: (entity) => setAddTarget(entity),
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
				<div className={editorEnabled ? undefined : styles.disabled}>
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
				<div className={editorEnabled ? undefined : styles.disabled}>
					<Inspector
						channel={selectionChannelRef.current}
						runtime={runtime}
					/>
				</div>
			);
		}
		return <div className={styles.placeholder}>Nothing selected</div>;
	};

	const renderConsole = () => <Console />;

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

	const renderSprite = (id: ViewId, param: string) =>
		param === NEW_PARAM ? (
			<SpriteEditor
				assetUrl={null}
				isTileset={createConfig?.isTileset ?? false}
				create={createConfig}
				onDirty={(d) => setViewDirty(id, d)}
				onCreated={onAssetCreated}
				active={focusedView === id}
			/>
		) : (
			<SpriteEditor
				assetUrl={param}
				isTileset={isTilesetName(param)}
				create={null}
				onDirty={(d) => setViewDirty(id, d)}
				onCreated={onAssetCreated}
				active={focusedView === id}
			/>
		);

	const renderScene = (id: ViewId) => {
		const view = ensureSceneView(id);
		if (!view) {
			return null;
		}
		return (
			<SceneViewPanel
				view={view}
				onPlay={playGame}
				onRun={startRun}
				onStop={stopRun}
				onPause={toggleRunPause}
				onStep={stepRun}
				onSetMode={setRunInputMode}
				inputMode={runMode}
				paused={runPaused}
				running={running && runHostRef.current?.view === view}
				editorEnabled={editorEnabled}
				requestAddComponent={(entity) => setAddTarget(entity)}
				undoShortcut={UNDO_SHORTCUT}
				redoShortcut={REDO_SHORTCUT}
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

	const renderView = (id: ViewId) => {
		const { kind, param } = parseViewId(id);
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
				return runtimeView(() => renderScene(id));
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
							active={focusedView === id}
						/>
					) : null;
				});
			case "sprite":
				return lazyView(renderSprite(id, param ?? ""));
			default:
				return null;
		}
	};

	return (
		<IconContext
			value={{ color: "currentColor", size: "1em", weight: "bold" }}
		>
			<AssetManagerProvider value={game?.assetManager ?? null}>
				<div className={styles.shell}>
					{isDesktop() && <TitleBar />}
					<div className={styles.appBody}>
						<ViewBar
							onOpen={openView}
							focusedKind={
								focusedView ? parseViewId(focusedView).kind : null
							}
						/>
						<div className={styles.workspaceArea}>
							<Workspace
								workspace={workspace}
								onChange={updateWorkspace}
								renderView={renderView}
								onCloseView={closeView}
								dirtyViews={dirtyViews}
							/>
						</div>
					</div>
				</div>
				{addTarget && deps && (
					<AddComponentPicker
						entity={addTarget}
						deps={deps}
						onClose={() => setAddTarget(null)}
					/>
				)}
				<NewSpriteDialog
					open={!!newSpriteKind}
					isTileset={newSpriteKind?.isTileset ?? false}
					onConfirm={confirmNewSprite}
					onClose={() => setNewSpriteKind(null)}
				/>
				<ConfirmDialog
					open={!!pendingDiscard}
					title="Discard your changes?"
					message="Your changes here haven't been saved yet."
					confirmLabel="Yes, discard"
					cancelLabel="No, keep"
					onConfirm={() => {
						const proceed = pendingDiscard;
						setPendingDiscard(null);
						proceed?.();
					}}
					onCancel={() => setPendingDiscard(null)}
				/>
				<Toaster />
			</AssetManagerProvider>
		</IconContext>
	);
};

export default App;
