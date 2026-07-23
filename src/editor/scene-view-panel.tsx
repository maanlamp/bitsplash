import clsx from "clsx";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { EntityId } from "../engine/ecs";
import { TILE_SIZE } from "../engine/tilemap/tile";
import Vector2 from "../engine/vector2";
import styles from "./app.module.scss";
import {
	AssetDropRegistry,
	DRAG_MIME,
	readDragPayload,
} from "./asset-drop-registry";
import { clientToCanvas } from "./client-to-canvas";
import { createEntity } from "./commands";
import { editorSettings } from "./editor-settings";
import {
	EntityContextMenu,
	type MenuDeps,
} from "./entity-context-menu";
import PerfOverlay from "./perf/perf-overlay";
import PlaybackBar from "./playback-bar";
import type { SceneView } from "./scene-view";
import { snap, type SnapResult } from "./snapping";
import TileLayersPanel from "./tile-layers-panel";
import Toolbar from "./toolbar";
import { useEditorValue } from "./use-editor";
import { useScopedHotkeys } from "./window/use-scoped-hotkeys";
import { useWindowWindow } from "./window/window-context";
import Split from "./workspace/split";

const SceneViewPanel = ({
	view,
	onRun,
	onStop,
	onPause,
	onStep,
	onSetMode,
	inputMode,
	paused,
	running,
	lockedOut,
	editorEnabled,
	requestAddComponent,
	undoShortcut,
	redoShortcut,
}: Readonly<{
	view: SceneView;
	onRun: () => void;
	onStop: () => void;
	onPause: () => void;
	onStep: () => void;
	onSetMode: (mode: "game" | "editor") => void;
	inputMode: "game" | "editor";
	paused: boolean;
	running: boolean;
	/**
	 * True when a run is active in another scene view. One run at a time: this
	 * scene is frozen and rendered darkened, and all its controls are inert (plan
	 * lines 146-148).
	 */
	lockedOut: boolean;
	editorEnabled: boolean;
	requestAddComponent: (entity: EntityId) => void;
	undoShortcut: string;
	redoShortcut: string;
}>) => {
	const ecs = view.scene.ecs;
	const doc = view.document;
	const store = view.store;
	const mode = useEditorValue(store, (s) => s.mode);
	const canUndo = useSyncExternalStore(
		doc.subscribe,
		() => doc.canUndo,
	);
	const canRedo = useSyncExternalStore(
		doc.subscribe,
		() => doc.canRedo,
	);
	const createPosRef = useRef<Vector2 | null>(null);
	const [menuEntity, setMenuEntity] = useState<EntityId | null>(null);
	const win = useWindowWindow();

	// Hold Space to temporarily pan (released restores the previous mode),
	// matching the sprite editor. The ref guards against keydown auto-repeat
	// pushing pan more than once per physical hold.
	const spaceHeld = useRef(false);
	useScopedHotkeys(
		"space",
		(e) => {
			if (e.type === "keydown") {
				if (!spaceHeld.current) {
					spaceHeld.current = true;
					store.pushTemporaryMode("pan");
				}
			} else if (spaceHeld.current) {
				spaceHeld.current = false;
				store.popTemporaryMode();
			}
		},
		{
			enabled: editorEnabled,
			keydown: true,
			keyup: true,
			preventDefault: true,
		},
		[store, editorEnabled],
	);

	// A hold's keyup goes to whichever window has focus; if focus leaves
	// mid-hold the pan would strand on top of the stack. Reset on blur.
	useEffect(() => {
		const onBlur = () => {
			spaceHeld.current = false;
			store.clearTemporaryModes();
		};
		win.addEventListener("blur", onBlur);
		return () => win.removeEventListener("blur", onBlur);
	}, [store, win]);

	const deps: MenuDeps = {
		ecs,
		document: doc,
		requestAddComponent,
		select: (entity) =>
			entity ? store.selectOne(entity) : store.clear(),
	};

	const attachedNodeRef = useRef<HTMLDivElement | null>(null);
	const attachRef = useCallback(
		(node: HTMLDivElement | null): void => {
			if (node) {
				attachedNodeRef.current = node;
				view.attach(node);
				if (styles.canvas) {
					view.viewport.element.classList.add(styles.canvas);
				}
			} else {
				// Detach only if this instance's node is still the mounted one: a
				// cross-window move mounts the destination panel before this (source)
				// panel unmounts, and a blind detach would tear down the fresh mount.
				const prev = attachedNodeRef.current;
				attachedNodeRef.current = null;
				if (prev) {
					view.detachIfCurrent(prev);
				}
			}
		},
		[view],
	);

	const recordCreatePosition = (e: React.MouseEvent): void => {
		const camera = view.displayCamera();
		if (!camera) {
			return;
		}
		const canvas = clientToCanvas(
			view.viewport.element,
			e.clientX,
			e.clientY,
		);
		createPosRef.current = camera.screenToWorld(
			new Vector2(canvas.x, canvas.y),
		);
	};

	const worldPointFrom = (
		clientX: number,
		clientY: number,
	): Vector2 | null => {
		const camera = view.displayCamera();
		if (!camera) {
			return null;
		}
		const canvas = clientToCanvas(
			view.viewport.element,
			clientX,
			clientY,
		);
		return camera.screenToWorld(new Vector2(canvas.x, canvas.y));
	};

	const snapPoint = (
		point: Readonly<{ x: number; y: number }>,
		ctrl = false,
	): SnapResult =>
		snap(null, point, {
			enabled: !ctrl,
			grid: TILE_SIZE,
			threshold: editorSettings.snapThreshold,
			neighbors: [],
		});

	const onDrop = (e: React.DragEvent): void => {
		if (!editorEnabled) {
			return;
		}
		const payload = readDragPayload(e.dataTransfer);
		if (!payload) {
			return;
		}
		const handler = AssetDropRegistry.resolve(payload, {
			target: "scene-view",
		});
		if (!handler) {
			return;
		}
		e.preventDefault();
		const point = worldPointFrom(e.clientX, e.clientY);
		if (!point) {
			return;
		}
		const snapped = snapPoint(point, e.ctrlKey);
		handler(payload, {
			target: "scene-view",
			sceneView: {
				document: doc,
				store,
				worldPoint: { x: snapped.x, y: snapped.y },
			},
		});
	};

	const onDragOver = (e: React.DragEvent): void => {
		if (editorEnabled && e.dataTransfer.types.includes(DRAG_MIME)) {
			e.preventDefault();
			e.dataTransfer.dropEffect = "copy";
		}
	};

	const onCreateEntity = (): void => {
		const pos = createPosRef.current;
		if (!pos) {
			return;
		}
		const snapped = snapPoint(pos);
		const id = createEntity(
			doc,
			view.scene.defaultEntity(new Vector2(snapped.x, snapped.y)),
		);
		store.selectOne(id);
	};

	const mount = (
		<div
			ref={attachRef}
			className={styles.canvasMount}
			onMouseLeave={() => store.setHovered(null)}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onContextMenu={(e) => {
				if (!editorEnabled) {
					e.preventDefault();
					e.stopPropagation();
					return;
				}
				recordCreatePosition(e);
				setMenuEntity(store.hovered);
			}}
		/>
	);

	return (
		<Split
			direction="row"
			initial={[0.78, 0.22]}
			storageKey="scene-split-layers"
		>
			<div
				className={clsx(
					styles.canvasStack,
					lockedOut && styles.disabled,
				)}
			>
				<EntityContextMenu
					entity={editorEnabled ? menuEntity : null}
					deps={editorEnabled ? deps : null}
					onCreateEntity={editorEnabled ? onCreateEntity : undefined}
				>
					{mount}
				</EntityContextMenu>
				<PerfOverlay view={view} />
				<PlaybackBar
					onRun={onRun}
					onStop={onStop}
					onPause={onPause}
					onStep={onStep}
					onSetMode={onSetMode}
					inputMode={inputMode}
					paused={paused}
					running={running}
				/>
				<Toolbar
					mode={mode}
					onModeChange={(m) => store.setMode(m)}
					editorEnabled={editorEnabled}
					onUndo={() => doc.undo()}
					onRedo={() => doc.redo()}
					canUndo={canUndo}
					canRedo={canRedo}
					undoShortcut={undoShortcut}
					redoShortcut={redoShortcut}
					debugFlags={view.debugFlags}
				/>
			</div>
			<TileLayersPanel view={view} editorEnabled={editorEnabled} />
		</Split>
	);
};

export default SceneViewPanel;
