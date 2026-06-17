import { IconContext } from "@phosphor-icons/react";
import {
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
import { createGame, createScene } from "../engine/scene/registry";
import type { Scene } from "../engine/scene/scene";
import styles from "./app.module.scss";
import { type AssetCreateActions } from "./asset-context-menu";
import { AssetManagerProvider } from "./asset-manager-context";
import {
	assetFilename,
	isFontName,
	isTilesetName,
	listAssets,
} from "./assets";
import AudioEditor from "./audio/audio-editor";
import { deleteEntity, duplicateEntity } from "./commands";
import ConfirmDialog from "./confirm-dialog";
import { setCursorMode } from "./cursor";
import {
	AddComponentPicker,
	type MenuDeps,
} from "./entity-context-menu";
import ProjectTree from "./project-tree";
import FontPreview from "./font/font-preview";
import Inspector from "./inspector";
import { MODES } from "./modes";
import PerfMonitor from "./perf-monitor";
import { Project } from "./project";
import "./register-renderers";
import { SceneView } from "./scene-view";
import SceneViewPanel from "./scene-view-panel";
import NewSpriteDialog from "./sprite/new-sprite-dialog";
import SpriteEditor, {
	type NewSpriteConfig,
} from "./sprite/sprite-editor";
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
import {
	assetViewId,
	isAssetView,
	isSceneView,
	isValidViewId,
	NEW_PARAM,
	parseViewId,
} from "./workspace/view-registry";
import Workspace from "./workspace/workspace";

const IS_MAC = /mac/i.test(navigator.platform);
const MOD = IS_MAC ? "⌘" : "Ctrl";
const UNDO_SHORTCUT = `${MOD}+Z`;
const REDO_SHORTCUT = `${MOD}+Y`;
const NEW_SPRITE_VIEW = "sprite:new";
const NEW_AUDIO_VIEW = "audio:new";

const firstSceneView = (workspace: WorkspaceState): ViewId | null =>
	allViewIds(workspace.root).find(isSceneView) ?? null;

type PlaySession = Readonly<{
	view: SceneView;
	overlay: Scene;
	paused: { value: boolean };
}>;

const App = ({ startScene }: { startScene: string }) => {
	const [game, setGame] = useState<Game | null>(null);
	const [addTarget, setAddTarget] = useState<EntityId | null>(null);
	const [playing, setPlaying] = useState(false);
	const [playView, setPlayView] = useState<SceneView | null>(null);
	const [, forceStore] = useReducer((n: number) => n + 1, 0);
	const [assets, setAssets] = useState(() => listAssets());
	const [workspace, setWorkspace] = useState<WorkspaceState>(() =>
		loadWorkspace(
			(id) => isValidViewId(id, assets),
			`scene:${startScene}`,
		),
	);
	const workspaceRef = useRef(workspace);
	const updateWorkspace = (next: WorkspaceState): void => {
		workspaceRef.current = next;
		setWorkspace(next);
		saveWorkspace(next);
	};

	const gameRef = useRef<Game | null>(null);
	const projectRef = useRef<Project | null>(null);
	const sceneViewsRef = useRef(new Map<ViewId, SceneView>());
	const historyUnsubsRef = useRef(new Map<ViewId, () => void>());
	const closedStackRef = useRef<ViewId[]>([]);
	const playingRef = useRef(false);
	const focusedSceneViewRef = useRef<SceneView | null>(null);
	const playSessionRef = useRef<PlaySession | null>(null);
	const playDetachRef = useRef<(() => void) | null>(null);
	const playContainerRef = useRef<HTMLDivElement | null>(null);

	const focusedView = workspace.focused;
	const focusedViewRef = useRef<ViewId | null>(focusedView);
	useEffect(() => {
		focusedViewRef.current = focusedView;
	}, [focusedView]);

	const saveScene = async (
		sceneId: string,
		view: SceneView,
	): Promise<void> => {
		await fetch("/__save-level", {
			method: "POST",
			headers: { "x-scene-id": sceneId },
			body: view.document.toBlob(),
		});
		view.document.markSaved();
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
		if (!param) {
			return null;
		}
		const scene = project.scene(param);
		const view = new SceneView(
			id,
			scene,
			project.store(param),
			instance.services,
		);
		const unsub = view.document.subscribe(() =>
			setViewDirty(id, view.document.dirty),
		);
		historyUnsubsRef.current.set(id, unsub);
		sceneViewsRef.current.set(id, view);
		return view;
	};

	const disposeSceneView = (id: ViewId): void => {
		const view = sceneViewsRef.current.get(id);
		if (!view) {
			return;
		}
		historyUnsubsRef.current.get(id)?.();
		historyUnsubsRef.current.delete(id);
		view.dispose();
		sceneViewsRef.current.delete(id);
	};

	if (game) {
		for (const id of allViewIds(workspace.root)) {
			if (isSceneView(id)) {
				ensureSceneView(id);
			}
		}
	}

	const focusedSceneView =
		focusedView && isSceneView(focusedView)
			? (sceneViewsRef.current.get(focusedView) ?? null)
			: null;
	const focusedScene = focusedSceneView?.scene ?? null;
	const focusedSceneId =
		focusedView && isSceneView(focusedView)
			? parseViewId(focusedView).param
			: null;
	const focusedStore = focusedSceneView?.store ?? null;
	const selectedEntity = focusedStore?.selected ?? null;
	const mode = focusedStore?.mode ?? "select";

	useEffect(() => {
		focusedSceneViewRef.current = focusedSceneView;
	}, [focusedSceneView]);

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
	}, [workspace]);

	const focusedAsset =
		focusedView && isAssetView(focusedView)
			? parseViewId(focusedView).param
			: null;
	const focusedAssetUrl =
		focusedAsset === NEW_PARAM ? null : focusedAsset;
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

	const closeView = (id: ViewId): void => {
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

	const selectEntity = (sceneId: string, id: EntityId): void => {
		openScene(sceneId);
		ensureSceneView(`scene:${sceneId}`)?.store.setSelected(id);
	};

	const selectWorld = (sceneId: string): void => {
		openScene(sceneId);
		ensureSceneView(`scene:${sceneId}`)?.store.setSelected(null);
	};

	useEffect(() => {
		if (!selectedEntity) {
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
	}, [selectedEntity]);

	const exitPlay = useCallback((): void => {
		const session = playSessionRef.current;
		const instance = gameRef.current;
		if (!session || !instance) {
			return;
		}
		if (session.paused.value) {
			instance.sceneManager.pop();
		}
		session.view.scene.setSimulating(false);
		session.view.resume();
		playSessionRef.current = null;
		playingRef.current = false;
		setPlayView(null);
		setPlaying(false);
	}, []);

	const play = (): void => {
		const view = focusedSceneViewRef.current;
		const instance = gameRef.current;
		if (!view || !instance) {
			return;
		}
		view.suspend();
		instance.sceneManager.setBase(view.scene);
		view.scene.setSimulating(true);
		playSessionRef.current = {
			view,
			overlay: createScene("pause", instance.services),
			paused: { value: false },
		};
		playingRef.current = true;
		setPlayView(view);
		setPlaying(true);
	};

	useEffect(() => {
		gameRef.current = null;
		const instance = createGame(startScene);
		gameRef.current = instance;
		projectRef.current = new Project(instance.services, {
			[startScene]: instance.scene!,
		});

		const clock = new Clock();
		let last = 0;
		let raf = 0;
		const frame = (time = last): void => {
			const before = performance.now();
			const dt = (time - last) as Milliseconds;
			clock.advance(dt);
			const now = clock.snapshot(dt);
			const fps = dt > 0 ? 1000 / dt : 0;
			const g = gameRef.current;
			if (g) {
				const session = playSessionRef.current;
				if (playingRef.current && session) {
					const { view } = session;
					view.input.update();
					g.sceneManager.update({ dt, time: now }, view.input);
					g.sceneManager.render(
						view.renderer,
						{ time: now },
						view.input,
					);
					view.renderer.endFrame();
					g.sceneManager.clearEvents();
					view.fps = fps;
					view.frameTime = performance.now() - before;
				} else {
					const focused = focusedSceneViewRef.current;
					for (const view of sceneViewsRef.current.values()) {
						if (view === focused) {
							view.update(dt, now);
						} else {
							view.rollInput();
						}
						const viewBefore = performance.now();
						view.render(now);
						view.frameTime = performance.now() - viewBefore;
						view.fps = fps;
					}
					focused?.scene.world.events.clear();
				}
				g.events.clear();
			}
			last = time;
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
		setGame(instance);

		return () => {
			cancelAnimationFrame(raf);
			for (const id of sceneViewsRef.current.keys()) {
				disposeSceneView(id);
			}
			instance.stop();
			gameRef.current = null;
			projectRef.current = null;
			setGame(null);
		};
	}, [startScene]);

	useEffect(() => {
		if (!playing) {
			return;
		}
		const instance = gameRef.current;
		const session = playSessionRef.current;
		if (!instance || !session) {
			return;
		}
		const el = session.view.viewport.element;
		const container = playContainerRef.current;
		const enter = container?.requestFullscreen?.();
		if (enter) {
			void enter.then(() => el.focus()).catch(() => el.focus());
		} else {
			el.focus();
		}

		const togglePause = (e: KeyboardEvent): void => {
			if (e.code !== "Backquote") {
				return;
			}
			e.preventDefault();
			if (session.paused.value) {
				instance.sceneManager.pop();
			} else {
				instance.sceneManager.push(session.overlay, {
					blocksUpdateBelow: true,
					blocksInputBelow: true,
				});
			}
			session.paused.value = !session.paused.value;
		};
		el.addEventListener("keydown", togglePause);
		const onFullscreen = (): void => {
			if (!document.fullscreenElement) {
				exitPlay();
			}
		};
		document.addEventListener("fullscreenchange", onFullscreen);

		return () => {
			el.removeEventListener("keydown", togglePause);
			document.removeEventListener("fullscreenchange", onFullscreen);
			if (document.fullscreenElement) {
				void document.exitFullscreen?.().catch(() => {});
			}
		};
	}, [playing, exitPlay]);

	const attachPlay = useCallback(
		(node: HTMLDivElement | null): void => {
			const session = playSessionRef.current;
			if (!session) {
				return;
			}
			if (node) {
				playContainerRef.current = node;
				playDetachRef.current = session.view.viewport.attach(node);
			} else {
				playContainerRef.current = null;
				playDetachRef.current?.();
				playDetachRef.current = null;
			}
		},
		[],
	);

	useEffect(() => {
		const el = focusedSceneView?.viewport.element;
		if (el) {
			setCursorMode(el, mode === "pan" ? "grab" : "default");
		}
	}, [focusedSceneView, mode]);

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
		{ enabled: !playing },
	);
	useHotkeys(
		"p",
		() => {
			if (assetFocused()) {
				return;
			}
			play();
		},
		{ enabled: !playing },
	);
	useHotkeys(
		"escape",
		() => {
			const id = focusedViewRef.current;
			if (id && isAssetView(id)) {
				closeView(id);
				return;
			}
			focusedSceneViewRef.current?.store.setSelected(null);
		},
		{ enabled: !playing },
	);
	useHotkeys(
		"delete,backspace",
		() => {
			const view = focusedSceneViewRef.current;
			const selected = view?.store.selected;
			if (assetFocused() || !view || !selected) {
				return;
			}
			deleteEntity(view.scene.world, view.history, selected);
			view.store.setSelected(null);
		},
		{ enabled: !playing },
	);
	useHotkeys(
		"mod+d",
		(event) => {
			event.preventDefault();
			if (assetFocused()) {
				return;
			}
			const view = focusedSceneViewRef.current;
			const selected = view?.store.selected;
			if (view && selected) {
				const id = duplicateEntity(
					view.scene.world,
					view.history,
					selected,
				);
				if (id) {
					view.store.setSelected(id);
				}
			}
		},
		{ preventDefault: true, enabled: !playing },
	);
	useHotkeys(
		"alt+w",
		(event) => {
			event.preventDefault();
			const id = focusedViewRef.current;
			if (id) {
				closeView(id);
			}
		},
		{ preventDefault: true, enabled: !playing },
	);
	useHotkeys(
		"alt+shift+t",
		(event) => {
			event.preventDefault();
			reopenClosed();
		},
		{ preventDefault: true, enabled: !playing },
	);
	useHotkeys(
		"mod+s",
		(event) => {
			event.preventDefault();
			if (assetFocused()) {
				return;
			}
			const id = focusedViewRef.current;
			const view = focusedSceneViewRef.current;
			if (id && isSceneView(id) && view) {
				const { param } = parseViewId(id);
				if (param) {
					void saveScene(param, view);
				}
			}
		},
		{ preventDefault: true, enabled: !playing },
	);
	useHotkeys(
		"mod+z",
		(event) => {
			if (assetFocused()) {
				return;
			}
			event.preventDefault();
			focusedSceneViewRef.current?.history.undo();
		},
		{ preventDefault: true, enabled: !playing },
	);
	useHotkeys(
		"mod+y",
		(event) => {
			if (assetFocused()) {
				return;
			}
			event.preventDefault();
			focusedSceneViewRef.current?.history.redo();
		},
		{ preventDefault: true, enabled: !playing },
	);

	const deps: MenuDeps | null = focusedSceneView
		? {
				ecs: focusedSceneView.scene.ecs,
				world: focusedSceneView.scene.world,
				history: focusedSceneView.history,
				requestAddComponent: (entity) => setAddTarget(entity),
				select: (entity) =>
					focusedSceneView.store.setSelected(entity),
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
				assets={assets}
				selectedAsset={focusedAssetUrl}
				assetActions={assetActions}
				onOpenScene={openScene}
				onSelectEntity={selectEntity}
				onSelectWorld={selectWorld}
				onOpenAsset={openAsset}
			/>
		) : null;

	const renderInspector = () =>
		focusedScene && focusedSceneView && selectedEntity ? (
			<Inspector
				ecs={focusedScene.ecs}
				store={focusedSceneView.store}
				history={focusedSceneView.history}
			/>
		) : (
			<div className={styles.placeholder}>Nothing selected</div>
		);

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
		if (!view || !game) {
			return null;
		}
		return (
			<SceneViewPanel
				view={view}
				onPlay={play}
				requestAddComponent={(entity) => setAddTarget(entity)}
				undoShortcut={UNDO_SHORTCUT}
				redoShortcut={REDO_SHORTCUT}
			/>
		);
	};

	const renderView = (id: ViewId) => {
		const { kind, param } = parseViewId(id);
		switch (kind) {
			case "tree":
				return renderTree();
			case "inspector":
				return renderInspector();
			case "scene":
				return renderScene(id);
			case "font":
				return game && param ? (
					<FontPreview
						assetUrl={param}
						assetManager={game.assetManager}
					/>
				) : null;
			case "audio":
				return game ? (
					<AudioEditor
						assetUrl={param === NEW_PARAM ? null : param}
						onDirty={(d) => setViewDirty(id, d)}
						audio={game.audio}
						onCreated={onAssetCreated}
						active={focusedView === id}
					/>
				) : null;
			case "sprite":
				return renderSprite(id, param ?? "");
			default:
				return null;
		}
	};

	return (
		<IconContext
			value={{ color: "currentColor", size: "1em", weight: "bold" }}
		>
			<AssetManagerProvider value={game?.assetManager ?? null}>
				{playing ? (
					<div className={styles.playSurface} ref={attachPlay}>
						{playView && <PerfMonitor stats={playView} />}
					</div>
				) : (
					<Workspace
						workspace={workspace}
						onChange={updateWorkspace}
						renderView={renderView}
						onCloseView={closeView}
						dirtyViews={dirtyViews}
					/>
				)}
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
			</AssetManagerProvider>
		</IconContext>
	);
};

export default App;
