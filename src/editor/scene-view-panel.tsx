import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { EntityId } from "../engine/ecs";
import { pickActiveCamera2D } from "../engine/camera/camera-2d-render";
import { TILE_SIZE } from "../engine/tilemap/tile";
import Vector2 from "../engine/vector2";
import styles from "./app.module.scss";
import { createEntity } from "./commands";
import {
	EntityContextMenu,
	type MenuDeps,
} from "./entity-context-menu";
import PerfMonitor from "./perf-monitor";
import PlaybackBar from "./playback-bar";
import type { SceneView } from "./scene-view";
import TileLayersPanel from "./tile-layers-panel";
import Toolbar from "./toolbar";
import { useEditorValue } from "./use-editor";
import Split from "./workspace/split";

const snap = (value: number): number =>
	Math.round(value / TILE_SIZE) * TILE_SIZE;

const SceneViewPanel = ({
	view,
	onPlay,
	onRun,
	onStop,
	onPause,
	onStep,
	onSetMode,
	inputMode,
	paused,
	running,
	editorEnabled,
	requestAddComponent,
	undoShortcut,
	redoShortcut,
}: Readonly<{
	view: SceneView;
	onPlay: () => void;
	onRun: () => void;
	onStop: () => void;
	onPause: () => void;
	onStep: () => void;
	onSetMode: (mode: "game" | "editor") => void;
	inputMode: "game" | "editor";
	paused: boolean;
	running: boolean;
	editorEnabled: boolean;
	requestAddComponent: (entity: EntityId) => void;
	undoShortcut: string;
	redoShortcut: string;
}>) => {
	const ecs = view.scene.ecs;
	const world = view.scene.world;
	const history = view.history;
	const store = view.store;
	const mode = useEditorValue(store, (s) => s.mode);
	const canUndo = useSyncExternalStore(
		history.subscribe,
		() => history.canUndo,
	);
	const canRedo = useSyncExternalStore(
		history.subscribe,
		() => history.canRedo,
	);
	const createPosRef = useRef<Vector2 | null>(null);
	const [menuEntity, setMenuEntity] = useState<EntityId | null>(null);
	const [vsync, setVsync] = useState(view.vsync);
	useEffect(() => {
		setVsync(view.vsync);
	}, [view]);
	const toggleVsync = (enabled: boolean): void => {
		view.setVsync(enabled);
		setVsync(view.vsync);
	};

	const deps: MenuDeps = {
		ecs,
		world,
		history,
		requestAddComponent,
		select: (entity) => store.setSelected(entity),
	};

	const attachRef = useCallback(
		(node: HTMLDivElement | null): void => {
			if (node) {
				view.attach(node);
				if (styles.canvas) {
					view.viewport.element.classList.add(styles.canvas);
				}
			} else {
				view.detach();
			}
		},
		[view],
	);

	const recordCreatePosition = (e: React.MouseEvent): void => {
		const camera = pickActiveCamera2D(ecs);
		if (!camera) {
			return;
		}
		const rect = view.viewport.element.getBoundingClientRect();
		createPosRef.current = camera.screenToWorld(
			new Vector2(e.clientX - rect.left, e.clientY - rect.top),
		);
	};

	const onCreateEntity = (): void => {
		const pos = createPosRef.current;
		if (!pos) {
			return;
		}
		const id = createEntity(
			world,
			history,
			view.scene.defaultEntity(new Vector2(snap(pos.x), snap(pos.y))),
		);
		store.setSelected(id);
	};

	const mount = (
		<div
			ref={attachRef}
			className={styles.canvasMount}
			onMouseLeave={() => store.setHovered(null)}
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
			<div className={styles.canvasStack}>
				<EntityContextMenu
					entity={editorEnabled ? menuEntity : null}
					deps={editorEnabled ? deps : null}
					onCreateEntity={editorEnabled ? onCreateEntity : undefined}
				>
					{mount}
				</EntityContextMenu>
				<PerfMonitor
					stats={view}
					vsync={vsync}
					onVsyncChange={toggleVsync}
				/>
				<PlaybackBar
					onPlaytest={onPlay}
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
					onUndo={() => history.undo()}
					onRedo={() => history.redo()}
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
