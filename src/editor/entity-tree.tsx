import {
	ArrowsOutCardinalIcon,
	AtomIcon,
	CaretRightIcon,
	CubeIcon,
	FileAudioIcon,
	FileIcon,
	FileImageIcon,
	FolderIcon,
	GameControllerIcon,
	GlobeIcon,
	HeartIcon,
	type Icon,
	PaletteIcon,
	PuzzlePieceIcon,
	SquaresFourIcon,
	TextAaIcon,
} from "@phosphor-icons/react";
import classNames from "classnames";
import { type ReactNode, useEffect, useReducer } from "react";
import {
	Button,
	type Selection,
	Tree,
	TreeItem,
	TreeItemContent,
} from "react-aria-components";
import type { ECS, EntityId } from "../engine/ecs";
import styles from "./entity-tree.module.scss";
import {
	AssetContextMenu,
	type AssetCreateActions,
} from "./asset-context-menu";
import type { AssetEntry } from "./assets";
import { componentLabel } from "./component-label";
import type { EditorState } from "./editor-state";
import {
	EditorStoreProvider,
	useIsHovered,
} from "./editor-store-context";
import {
	EntityContextMenu,
	type MenuDeps,
} from "./entity-context-menu";
import { useEditorValue } from "./use-editor";

const COMPONENT_ICONS: Readonly<Record<string, Icon>> = {
	TransformComponent: ArrowsOutCardinalIcon,
	RigidbodyComponent: AtomIcon,
	PhysicsBodyComponent: AtomIcon,
	SpriteComponent: PaletteIcon,
	PlayerInputComponent: GameControllerIcon,
	HealthComponent: HeartIcon,
};

const WORLD_KEY = "world";

const RowSurface = ({
	entity,
	isSelected,
	level,
	muted,
	onEnter,
	onLeave,
	children,
}: Readonly<{
	entity?: EntityId;
	isSelected: boolean;
	level: number;
	muted?: boolean;
	onEnter?: () => void;
	onLeave?: () => void;
	children: ReactNode;
}>) => {
	const isHovered = useIsHovered(entity);
	return (
		<div
			className={classNames(
				styles.row,
				isSelected && styles.rowSelected,
				isHovered && styles.rowHovered,
				muted && styles.rowMuted,
			)}
			style={{
				paddingLeft: `calc(var(--unit-4) + ${level - 1} * var(--unit-16))`,
			}}
			onMouseEnter={onEnter}
			onMouseLeave={onLeave}
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
					entity={entity}
					isSelected={isSelected && !muted}
					muted={muted}
					level={level}
					onEnter={
						entity ? () => store.setHovered(entity) : undefined
					}
					onLeave={entity ? () => store.setHovered(null) : undefined}
				>
					{hasChildItems ? (
						<Button slot="chevron" className={styles.chevron}>
							<CaretRightIcon
								className={classNames(isExpanded && styles.caretOpen)}
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

const ASSETS_KEY = "assets";

const EntityTree = ({
	ecs,
	store,
	deps,
	assets,
	selectedAsset,
	assetActions,
	onSelectEntity,
	onSelectWorld,
	onOpenAsset,
}: Readonly<{
	ecs: ECS;
	store: EditorState;
	deps: MenuDeps;
	assets: ReadonlyArray<AssetEntry>;
	selectedAsset: string | null;
	assetActions: AssetCreateActions;
	onSelectEntity: (id: EntityId) => void;
	onSelectWorld: () => void;
	onOpenAsset: (url: string) => void;
}>) => {
	const selected = useEditorValue(store, (s) => s.selected);
	const [, force] = useReducer((n: number) => n + 1, 0);
	useEffect(() => ecs.subscribe(force), [ecs]);

	const entities = ecs.entities();
	const expandedKeys = [WORLD_KEY, ASSETS_KEY];
	const selectedKeys = selectedAsset
		? new Set([`asset:${selectedAsset}`])
		: selected
			? new Set([`entity:${selected}`])
			: new Set<string>();

	const handleSelection = (keys: Selection): void => {
		if (keys === "all") {
			return;
		}
		const key = [...keys][0];
		if (typeof key !== "string") {
			return;
		}
		if (key === WORLD_KEY) {
			onSelectWorld();
		} else if (key.startsWith("asset:")) {
			const url = key.slice("asset:".length);
			if (
				assets.some(
					(a) => a.url === url && (a.isPng || a.isAudio || a.isFont),
				)
			) {
				onOpenAsset(url);
			}
		} else if (key.startsWith("entity:")) {
			onSelectEntity(
				key.slice("entity:".length).split(":")[0] as EntityId,
			);
		}
	};

	return (
		<EditorStoreProvider value={store}>
			<Tree
				aria-label="Scene"
				className={styles.tree}
				selectionMode="single"
				selectedKeys={selectedKeys}
				onSelectionChange={handleSelection}
				defaultExpandedKeys={expandedKeys}
			>
				<TreeItem id={WORLD_KEY} textValue="World">
					<Row icon={GlobeIcon} label="World" store={store} />
					{entities.map((id) => (
						<TreeItem
							key={`entity:${id}`}
							id={`entity:${id}`}
							textValue={id}
						>
							<Row
								icon={CubeIcon}
								label={id}
								store={store}
								entity={id}
								deps={deps}
							/>
							{ecs.componentsOf(id).map((component) => {
								const name = component.constructor.name;
								return (
									<TreeItem
										key={`entity:${id}:${name}`}
										id={`entity:${id}:${name}`}
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
				<TreeItem id={ASSETS_KEY} textValue="Assets">
					<Row
						icon={FolderIcon}
						label="Assets"
						store={store}
						wrap={(content) => (
							<AssetContextMenu actions={assetActions}>
								{content}
							</AssetContextMenu>
						)}
					/>
					{assets.map((asset) => (
						<TreeItem
							key={`asset:${asset.url}`}
							id={`asset:${asset.url}`}
							textValue={asset.name}
						>
							<Row
								icon={
									asset.isTileset
										? SquaresFourIcon
										: asset.isPng
											? FileImageIcon
											: asset.isAudio
												? FileAudioIcon
												: asset.isFont
													? TextAaIcon
													: FileIcon
								}
								label={asset.name}
								store={store}
								muted={
									!asset.isPng && !asset.isAudio && !asset.isFont
								}
								wrap={(content) => (
									<AssetContextMenu actions={assetActions}>
										{content}
									</AssetContextMenu>
								)}
							/>
						</TreeItem>
					))}
				</TreeItem>
			</Tree>
		</EditorStoreProvider>
	);
};

export default EntityTree;
