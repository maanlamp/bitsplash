import {
	ArrowsOutCardinalIcon,
	AtomIcon,
	CaretRightIcon,
	CubeIcon,
	FilmSlateIcon,
	GameControllerIcon,
	GlobeIcon,
	HeartIcon,
	type Icon,
	PaletteIcon,
	PuzzlePieceIcon,
	StackIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import {
	type ReactNode,
	useEffect,
	useReducer,
	useState,
	useSyncExternalStore,
} from "react";
import {
	Button,
	type Key,
	type Selection,
	Tree,
	TreeItem,
	TreeItemContent,
} from "react-aria-components";
import type { EntityId } from "../engine/ecs";
import type { SceneSummary } from "../engine/scene/registry";
import type { Scene } from "../engine/scene/scene";
import { componentLabel } from "./component-label";
import { EditorState } from "./editor-state";
import {
	EntityContextMenu,
	type MenuDeps,
} from "./entity-context-menu";
import styles from "./project-tree.module.scss";

const COMPONENT_ICONS: Readonly<Record<string, Icon>> = {
	TransformComponent: ArrowsOutCardinalIcon,
	PhysicsBodyComponent: AtomIcon,
	SpriteComponent: PaletteIcon,
	PlayerInputComponent: GameControllerIcon,
	HealthComponent: HeartIcon,
};

const GAME_KEY = "game";

const RowSurface = ({
	store,
	entity,
	isSelected,
	level,
	muted,
	children,
}: Readonly<{
	store: EditorState;
	entity?: EntityId;
	isSelected: boolean;
	level: number;
	muted?: boolean;
	children: ReactNode;
}>) => {
	const isHovered = useSyncExternalStore(
		store.subscribeHover,
		() => entity != null && store.hovered === entity,
	);
	return (
		<div
			className={clsx(
				styles.row,
				isSelected && styles.rowSelected,
				isHovered && styles.rowHovered,
				muted && styles.rowMuted,
			)}
			style={{
				paddingLeft: `calc(var(--unit-4) + ${level - 1} * var(--unit-16))`,
			}}
			onMouseEnter={
				entity ? () => store.setHovered(entity) : undefined
			}
			onMouseLeave={entity ? () => store.setHovered(null) : undefined}
		>
			{children}
		</div>
	);
};

const Row = ({
	icon: RowIcon,
	label,
	store,
	entity,
	deps,
	muted,
	wrap,
}: Readonly<{
	icon: Icon;
	label: string;
	store: EditorState;
	entity?: EntityId;
	deps?: MenuDeps;
	muted?: boolean;
	wrap?: (content: ReactNode) => ReactNode;
}>) => (
	<TreeItemContent>
		{({ level, hasChildItems, isExpanded, isSelected }) => {
			const content = (
				<RowSurface
					store={store}
					entity={entity}
					isSelected={isSelected && !muted}
					muted={muted}
					level={level}
				>
					{hasChildItems ? (
						<Button slot="chevron" className={styles.chevron}>
							<CaretRightIcon
								className={clsx(isExpanded && styles.caretOpen)}
							/>
						</Button>
					) : (
						<span className={styles.chevronSpacer} />
					)}
					<RowIcon className={styles.rowIcon} weight="bold" />
					<span>{label}</span>
				</RowSurface>
			);
			if (entity && deps) {
				return (
					<EntityContextMenu entity={entity} deps={deps}>
						{content}
					</EntityContextMenu>
				);
			}
			if (wrap) {
				return wrap(content);
			}
			return content;
		}}
	</TreeItemContent>
);

const SceneEntities = ({
	scene,
	sceneId,
	store,
	deps,
}: Readonly<{
	scene: Scene;
	sceneId: string;
	store: EditorState;
	deps?: MenuDeps;
}>) => (
	<TreeItem id={`world:${sceneId}`} textValue="World">
		<Row icon={GlobeIcon} label="World" store={store} />
		{scene.ecs.entities().map((id) => (
			<TreeItem
				key={`entity:${sceneId}:${id}`}
				id={`entity:${sceneId}:${id}`}
				textValue={id}
			>
				<Row
					icon={CubeIcon}
					label={id}
					store={store}
					entity={id}
					deps={deps}
				/>
				{scene.ecs.componentsOf(id).map((component) => {
					const name = component.constructor.name;
					return (
						<TreeItem
							key={`comp:${sceneId}:${id}:${name}`}
							id={`comp:${sceneId}:${id}:${name}`}
							textValue={name}
						>
							<Row
								icon={COMPONENT_ICONS[name] ?? PuzzlePieceIcon}
								label={componentLabel(component)}
								store={store}
								entity={id}
								deps={deps}
							/>
						</TreeItem>
					);
				})}
			</TreeItem>
		))}
	</TreeItem>
);

const ProjectTree = ({
	summaries,
	focusedSceneId,
	loadedScene,
	ensureScene,
	storeFor,
	focusedStore,
	deps,
	onOpenScene,
	onSelectEntities,
	onSelectWorld,
}: Readonly<{
	summaries: ReadonlyArray<SceneSummary>;
	focusedSceneId: string | null;
	loadedScene: (id: string) => Scene | null;
	ensureScene: (id: string) => void;
	storeFor: (id: string) => EditorState | null;
	focusedStore: EditorState | null;
	deps: MenuDeps | null;
	onOpenScene: (id: string) => void;
	onSelectEntities: (
		sceneId: string,
		ids: ReadonlyArray<EntityId>,
	) => void;
	onSelectWorld: (sceneId: string) => void;
}>) => {
	const [fallbackStore] = useState(() => new EditorState());
	const [, force] = useReducer((n: number) => n + 1, 0);
	const focusedScene = focusedSceneId
		? loadedScene(focusedSceneId)
		: null;
	useEffect(() => {
		if (focusedScene) {
			return focusedScene.ecs.subscribe(force);
		}
	}, [focusedScene]);
	useEffect(() => {
		if (focusedStore) {
			return focusedStore.subscribe(force);
		}
	}, [focusedStore]);

	const selection = focusedStore?.selection ?? null;
	const inspectingWorld = focusedStore?.inspectingWorld ?? false;

	const [expanded, setExpanded] = useState<Set<Key>>(() => {
		const initial: Key[] = [GAME_KEY];
		if (focusedSceneId) {
			initial.push(
				`scene:${focusedSceneId}`,
				`world:${focusedSceneId}`,
			);
		}
		return new Set(initial);
	});

	const onExpandedChange = (keys: Set<Key>): void => {
		for (const key of keys) {
			if (typeof key === "string" && key.startsWith("scene:")) {
				ensureScene(key.slice("scene:".length));
			}
		}
		setExpanded(new Set(keys));
	};

	const selectedKeys: Set<string> =
		focusedSceneId && inspectingWorld
			? new Set([`world:${focusedSceneId}`])
			: focusedSceneId && selection && selection.ids.size > 0
				? new Set(
						[...selection.ids].map(
							(id) => `entity:${focusedSceneId}:${id}`,
						),
					)
				: focusedSceneId
					? new Set([`scene:${focusedSceneId}`])
					: new Set<string>();

	const handleSelection = (keys: Selection): void => {
		if (keys === "all") {
			if (focusedSceneId && focusedScene) {
				onSelectEntities(focusedSceneId, focusedScene.ecs.entities());
			}
			return;
		}
		const ids: EntityId[] = [];
		let entityScene: string | null = null;
		let worldScene: string | null = null;
		let sceneToOpen: string | null = null;
		for (const key of keys) {
			if (typeof key !== "string") {
				continue;
			}
			if (key.startsWith("entity:") || key.startsWith("comp:")) {
				const [, sid, id] = key.split(":");
				if (sid && id) {
					entityScene ??= sid;
					if (sid === entityScene) {
						ids.push(id as EntityId);
					}
				}
			} else if (key.startsWith("world:")) {
				worldScene = key.slice("world:".length);
			} else if (key.startsWith("scene:")) {
				sceneToOpen = key.slice("scene:".length);
			}
		}
		if (entityScene && ids.length > 0) {
			const set = new Set(ids);
			const scene = loadedScene(entityScene);
			const ordered = scene
				? scene.ecs.entities().filter((id) => set.has(id))
				: [...set];
			onSelectEntities(
				entityScene,
				ordered.length > 0 ? ordered : [...set],
			);
			return;
		}
		if (worldScene) {
			onSelectWorld(worldScene);
			return;
		}
		if (sceneToOpen) {
			onOpenScene(sceneToOpen);
		}
	};

	return (
		<Tree
			aria-label="Project"
			className={styles.tree}
			selectionMode="multiple"
			selectionBehavior="replace"
			selectedKeys={selectedKeys}
			onSelectionChange={handleSelection}
			expandedKeys={expanded}
			onExpandedChange={onExpandedChange}
		>
			<TreeItem id={GAME_KEY} textValue="Game">
				<Row
					icon={GameControllerIcon}
					label="Game"
					store={fallbackStore}
				/>
				{summaries.map((summary) => {
					const scene = loadedScene(summary.id);
					return (
						<TreeItem
							key={`scene:${summary.id}`}
							id={`scene:${summary.id}`}
							textValue={summary.name}
						>
							<Row
								icon={FilmSlateIcon}
								label={summary.name}
								store={fallbackStore}
							/>
							{scene ? (
								<SceneEntities
									scene={scene}
									sceneId={summary.id}
									store={storeFor(summary.id) ?? fallbackStore}
									deps={
										summary.id === focusedSceneId
											? (deps ?? undefined)
											: undefined
									}
								/>
							) : (
								<TreeItem
									id={`world:${summary.id}`}
									textValue="World"
								>
									<Row
										icon={StackIcon}
										label="World"
										store={fallbackStore}
										muted
									/>
								</TreeItem>
							)}
						</TreeItem>
					);
				})}
			</TreeItem>
		</Tree>
	);
};

export default ProjectTree;
