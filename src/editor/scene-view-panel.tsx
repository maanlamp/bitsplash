import {
	useCallback,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { EntityId } from "../engine/ecs";
import { pickActiveCamera2D } from "../engine/systems/camera-2d";
import { TILE_SIZE } from "../engine/tile";
import Vector2 from "../engine/vector2";
import styles from "./app.module.scss";
import { createEntity } from "./commands";
import {
	EntityContextMenu,
	type MenuDeps,
} from "./entity-context-menu";
import PerfMonitor from "./perf-monitor";
import type { SceneView } from "./scene-view";
import Toolbar from "./toolbar";
import { useEditorValue } from "./use-editor";

const snap = (value: number): number =>
	Math.round(value / TILE_SIZE) * TILE_SIZE;

const SceneViewPanel = ({
	view,
	onPlay,
	requestAddComponent,
	undoShortcut,
	redoShortcut,
}: Readonly<{
	view: SceneView;
	onPlay: () => void;
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

	return (
		<div className={styles.canvasStack}>
			<EntityContextMenu
				entity={menuEntity}
				deps={deps}
				onCreateEntity={onCreateEntity}
			>
				<div
					ref={attachRef}
					className={styles.canvasMount}
					onMouseLeave={() => store.setHovered(null)}
					onContextMenu={(e) => {
						recordCreatePosition(e);
						setMenuEntity(store.hovered);
					}}
				/>
			</EntityContextMenu>
			<PerfMonitor stats={view} />
			<Toolbar
				mode={mode}
				onModeChange={(m) => store.setMode(m)}
				onPlay={onPlay}
				onUndo={() => history.undo()}
				onRedo={() => history.redo()}
				canUndo={canUndo}
				canRedo={canRedo}
				undoShortcut={undoShortcut}
				redoShortcut={redoShortcut}
			/>
		</div>
	);
};

export default SceneViewPanel;
