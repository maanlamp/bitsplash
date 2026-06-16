import { IconContext } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import type { EntityId } from "../engine/ecs";
import type { Game } from "../engine/game";
import { createGame } from "../engine/scene/registry";
import { serializeWorld } from "../engine/serialization/serialize";
import { pickActiveCamera2D } from "../engine/systems/camera-2d";
import { DebugGridSystem } from "../engine/systems/debug-grid";
import { TILE_SIZE } from "../engine/tile";
import Vector2 from "../engine/vector2";
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
import {
	createEntity,
	deleteEntity,
	duplicateEntity,
} from "./commands";
import ConfirmDialog from "./confirm-dialog";
import { EditorLayer } from "./constants";
import { setCursorMode } from "./cursor";
import { EditorState } from "./editor-state";
import {
	AddComponentPicker,
	EntityContextMenu,
	type MenuDeps,
} from "./entity-context-menu";
import EntityTree from "./entity-tree";
import FontPreview from "./font/font-preview";
import { History } from "./history";
import Inspector from "./inspector";
import { exportLevelJson } from "./level-export";
import { MODES } from "./modes";
import PerfMonitor from "./perf-monitor";
import "./register-renderers";
import NewSpriteDialog from "./sprite/new-sprite-dialog";
import SpriteEditor, {
	type NewSpriteConfig,
} from "./sprite/sprite-editor";
import { EditorCamera2DSystem } from "./systems/editor-camera-2d";
import { EntityEditorSystem } from "./systems/entity-editor";
import { EntityHighlightSystem } from "./systems/entity-highlight";
import { TileEditorSystem } from "./systems/tile-editor";
import { TileEditorPreviewSystem } from "./systems/tile-editor-preview";
import Toolbar from "./toolbar";
import { useEditorValue } from "./use-editor";
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

const snap = (value: number): number =>
	Math.round(value / TILE_SIZE) * TILE_SIZE;

const App = ({ defaultScene }: { defaultScene: string }) => {
	const mountRef = useRef<HTMLDivElement>(null);
	const [store] = useState(() => new EditorState());
	const [game, setGame] = useState<Game | null>(null);
	const [addTarget, setAddTarget] = useState<EntityId | null>(null);
	const createPosRef = useRef<Vector2 | null>(null);

	const mode = useEditorValue(store, (s) => s.mode);
	const selectedEntity = useEditorValue(store, (s) => s.selected);
	const [assets, setAssets] = useState(() => listAssets());
	const [workspace, setWorkspace] = useState<WorkspaceState>(() =>
		loadWorkspace((id) => isValidViewId(id, assets)),
	);
	const workspaceRef = useRef(workspace);
	const updateWorkspace = (next: WorkspaceState): void => {
		workspaceRef.current = next;
		setWorkspace(next);
		saveWorkspace(next);
	};

	const focusedView = workspace.focused;
	const focusedViewRef = useRef<ViewId | null>(focusedView);
	useEffect(() => {
		focusedViewRef.current = focusedView;
	}, [focusedView]);

	useEffect(() => {
		if (!selectedEntity) {
			return;
		}
		const ws = workspaceRef.current;
		if (findView(ws.root, "inspector")) {
			return;
		}
		const canvasPath = findView(ws.root, "canvas");
		const root = canvasPath
			? insertView(ws.root, "inspector", canvasPath, "right")
			: ws.root;
		updateWorkspace({ ...ws, root });
	}, [selectedEntity]);
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

	const [menuEntity, setMenuEntity] = useState<EntityId | null>(null);
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
		const anchor = findView(ws.root, "canvas")
			? "canvas"
			: ws.focused;
		const anchorPath = anchor ? findView(ws.root, anchor) : null;
		const root = anchorPath
			? insertView(ws.root, id, anchorPath, "center")
			: ws.root;
		updateWorkspace({ ...ws, root, focused: id });
	};

	const focusView = (id: ViewId): void => {
		const ws = workspaceRef.current;
		updateWorkspace({
			...ws,
			root: setActive(ws.root, id),
			focused: id,
		});
	};

	const removeViewNow = (id: ViewId): void => {
		const ws = workspaceRef.current;
		let root = removeView(ws.root, id);
		setViewDirty(id, false);
		const nextFocus = findView(root, "canvas")
			? "canvas"
			: (allViewIds(root)[0] ?? null);
		if (nextFocus) {
			root = setActive(root, nextFocus);
		}
		updateWorkspace({ ...ws, root, focused: nextFocus });
	};

	const closeView = (id: ViewId): void => {
		if (isViewDirty(id)) {
			setPendingDiscard(() => () => removeViewNow(id));
		} else {
			removeViewNow(id);
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
		// TODO: This code is almost exactly the same as assets.ts listAssets().
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

	const selectEntity = (id: EntityId): void => {
		store.setSelected(id);
		focusView("canvas");
	};

	const selectWorld = (): void => {
		store.setSelected(null);
		focusView("canvas");
	};

	const gameInstanceRef = useRef<Game>(null);
	const editorCameraSystemRef = useRef<EditorCamera2DSystem>(null);
	const tileEditorSystemRef = useRef<TileEditorSystem>(null);
	const entityEditorSystemRef = useRef<EntityEditorSystem>(null);
	const tileEditorPreviewSystemRef =
		useRef<TileEditorPreviewSystem>(null);
	const entityHighlightSystemRef =
		useRef<EntityHighlightSystem>(null);
	const debugGridSystemRef = useRef<DebugGridSystem>(null);
	const [historyInstance, setHistoryInstance] =
		useState<History | null>(null);
	const [history, setHistory] = useState({
		canUndo: false,
		canRedo: false,
	});

	const detachViewportRef = useRef<(() => void) | null>(null);
	const attachViewport = (node: HTMLDivElement | null): void => {
		detachViewportRef.current?.();
		detachViewportRef.current = null;
		const inst = gameInstanceRef.current;
		if (inst && node) {
			detachViewportRef.current = inst.viewport.attach(node);
			if (styles.canvas) {
				inst.viewport.element.classList.add(styles.canvas);
			}
		}
	};
	const setMountNode = useCallback(
		(node: HTMLDivElement | null): void => {
			mountRef.current = node;
			attachViewport(node);
		},
		[],
	);

	const setEditorSystemsActive = (active: boolean) => {
		const inst = gameInstanceRef.current;
		if (!inst) {
			return;
		}
		const updates = [
			editorCameraSystemRef.current,
			tileEditorSystemRef.current,
			entityEditorSystemRef.current,
		];
		const renders = [
			tileEditorPreviewSystemRef.current,
			debugGridSystemRef.current,
			entityHighlightSystemRef.current,
		];
		for (const system of updates) {
			if (!system) {
				continue;
			}
			if (active) {
				inst.ecs.addUpdateSystem(system);
			} else {
				inst.ecs.removeUpdateSystem(system);
			}
		}
		for (const system of renders) {
			if (!system) {
				continue;
			}
			if (active) {
				inst.ecs.addRenderSystem(system);
			} else {
				inst.ecs.removeRenderSystem(system);
			}
		}
		editorCameraSystemRef.current?.setActive(active);
	};

	const play = async () => {
		const inst = gameInstanceRef.current;
		if (!inst) {
			return;
		}
		setEditorSystemsActive(false);
		inst.setSimulating(true);
		await inst.viewport.element.requestFullscreen();
		inst.viewport.element.focus();

		const handle = (e: Event) => {
			if (e.target === document.fullscreenElement) {
				return;
			}
			inst.setSimulating(false);
			setEditorSystemsActive(true);
			const mount = mountRef.current;
			if (mount) {
				inst.viewport.resize(mount.clientWidth, mount.clientHeight);
			}
			inst.viewport.element.removeEventListener(
				"fullscreenchange",
				handle,
			);
		};
		inst.viewport.element.addEventListener(
			"fullscreenchange",
			handle,
		);
	};

	useHotkeys(
		MODES.map((m) => m.shortcut).join(","),
		(_event, handler) => {
			if (assetFocused()) {
				return;
			}
			const key = handler.keys?.[0];
			const target = MODES.find((m) => m.shortcut === key);
			if (target) {
				store.setMode(target.id);
			}
		},
	);
	useHotkeys("p", () => {
		if (assetFocused()) {
			return;
		}
		void play();
	});
	useHotkeys("escape", () => {
		const id = focusedViewRef.current;
		if (id && isAssetView(id)) {
			closeView(id);
			return;
		}
		store.setSelected(null);
	});
	useHotkeys("delete,backspace", () => {
		const inst = gameInstanceRef.current;
		const selected = store.selected;
		if (assetFocused()) {
			return;
		}
		if (inst && historyInstance && selected) {
			deleteEntity(inst.world, historyInstance, selected);
			store.setSelected(null);
		}
	});
	useHotkeys(
		"mod+d",
		(event) => {
			event.preventDefault();
			if (assetFocused()) {
				return;
			}
			const inst = gameInstanceRef.current;
			const selected = store.selected;
			if (inst && historyInstance && selected) {
				const id = duplicateEntity(
					inst.world,
					historyInstance,
					selected,
				);
				if (id) {
					store.setSelected(id);
				}
			}
		},
		{ preventDefault: true },
	);
	useHotkeys(
		"mod+z",
		(event) => {
			if (assetFocused()) {
				return;
			}
			event.preventDefault();
			historyInstance?.undo();
		},
		{ preventDefault: true },
	);
	useHotkeys(
		"mod+y",
		(event) => {
			if (assetFocused()) {
				return;
			}
			event.preventDefault();
			historyInstance?.redo();
		},
		{ preventDefault: true },
	);

	useEffect(() => {
		if (!mountRef.current) {
			throw new Error("Null canvas mount ref.");
		}

		gameInstanceRef.current = createGame(defaultScene);
		const instance = gameInstanceRef.current;
		const tileGrid = instance.tileGrid;
		if (!tileGrid) {
			throw new Error("Editor requires a scene with a tile grid.");
		}
		attachViewport(mountRef.current);
		const history = new History();
		setHistoryInstance(history);
		let saveTimer: number | undefined;
		const unsubscribe = history.subscribe(() => {
			setHistory({
				canUndo: history.canUndo,
				canRedo: history.canRedo,
			});
			window.clearTimeout(saveTimer);
			saveTimer = window.setTimeout(() => {
				void fetch("/__save-level", {
					method: "POST",
					body: exportLevelJson(
						tileGrid,
						serializeWorld(instance.ecs),
					),
				});
			}, 300);
		});

		editorCameraSystemRef.current = new EditorCamera2DSystem(
			tileGrid,
			store,
		);
		tileEditorSystemRef.current = new TileEditorSystem(
			tileGrid,
			store,
			history,
		);
		entityEditorSystemRef.current = new EntityEditorSystem(
			store,
			history,
		);
		tileEditorPreviewSystemRef.current = new TileEditorPreviewSystem(
			tileGrid,
			EditorLayer.EDITOR_PREVIEW,
			store,
		);
		entityHighlightSystemRef.current = new EntityHighlightSystem(
			store,
			EditorLayer.EDITOR_PREVIEW,
		);
		debugGridSystemRef.current = new DebugGridSystem(
			EditorLayer.DEBUG_GRID,
		);
		setEditorSystemsActive(true);

		const stop = instance.start();
		setGame(instance);

		return () => {
			window.clearTimeout(saveTimer);
			unsubscribe();
			stop();
			detachViewportRef.current?.();
			detachViewportRef.current = null;
			setGame(null);
		};
	}, [store, defaultScene]);

	useEffect(() => {
		const el = game?.viewport.element;
		if (el) {
			setCursorMode(el, mode === "pan" ? "grab" : "default");
		}
	}, [game, mode]);

	const deps: MenuDeps | null = game
		? {
				ecs: game.ecs,
				world: game.world,
				history: historyInstance!,
				requestAddComponent: (entity) => setAddTarget(entity),
				select: (entity) => store.setSelected(entity),
			}
		: null;

	const recordCreatePosition = (e: React.MouseEvent) => {
		const inst = gameInstanceRef.current;
		if (!inst) {
			return;
		}
		const camera = pickActiveCamera2D(inst.ecs);
		if (!camera) {
			return;
		}
		const rect = inst.viewport.element.getBoundingClientRect();
		createPosRef.current = camera.screenToWorld(
			new Vector2(e.clientX - rect.left, e.clientY - rect.top),
		);
	};

	const onCreateEntity = () => {
		const inst = gameInstanceRef.current;
		const pos = createPosRef.current;
		if (!inst || !historyInstance || !pos) {
			return;
		}
		const id = createEntity(
			inst.world,
			historyInstance,
			inst.defaultEntity(new Vector2(snap(pos.x), snap(pos.y))),
		);
		store.setSelected(id);
	};

	const renderTree = () =>
		game && deps ? (
			<EntityTree
				ecs={game.ecs}
				store={store}
				deps={deps}
				assets={assets}
				selectedAsset={focusedAssetUrl}
				assetActions={assetActions}
				onSelectEntity={selectEntity}
				onSelectWorld={selectWorld}
				onOpenAsset={openAsset}
			/>
		) : null;

	const renderInspector = () =>
		game && historyInstance && selectedEntity ? (
			<Inspector
				ecs={game.ecs}
				store={store}
				history={historyInstance}
			/>
		) : (
			<div className={styles.placeholder}>Nothing selected</div>
		);

	const renderCanvas = () => (
		<div className={styles.canvasStack}>
			<EntityContextMenu
				entity={menuEntity}
				deps={deps}
				onCreateEntity={onCreateEntity}
			>
				<div
					ref={setMountNode}
					className={styles.canvasMount}
					onMouseLeave={() => store.setHovered(null)}
					onContextMenu={(e) => {
						recordCreatePosition(e);
						setMenuEntity(store.hovered);
					}}
				/>
			</EntityContextMenu>
			{game && <PerfMonitor game={game} />}
			<Toolbar
				mode={mode}
				onModeChange={(m) => store.setMode(m)}
				onPlay={play}
				onUndo={() => historyInstance?.undo()}
				onRedo={() => historyInstance?.redo()}
				canUndo={history.canUndo}
				canRedo={history.canRedo}
				undoShortcut={UNDO_SHORTCUT}
				redoShortcut={REDO_SHORTCUT}
			/>
		</div>
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

	const renderView = (id: ViewId) => {
		const { kind, param } = parseViewId(id);
		switch (kind) {
			case "tree":
				return renderTree();
			case "inspector":
				return renderInspector();
			case "canvas":
				return renderCanvas();
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
				<Workspace
					workspace={workspace}
					onChange={updateWorkspace}
					renderView={renderView}
					onCloseView={closeView}
					dirtyViews={dirtyViews}
				/>
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
