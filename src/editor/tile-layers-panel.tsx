import { Select } from "@base-ui/react/select";
import {
	CaretDownIcon,
	CubeIcon,
	EyeIcon,
	EyeSlashIcon,
	ImageIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import classNames from "classnames";
import { Reorder } from "motion/react";
import { useEffect, useReducer, useRef, useState } from "react";
import type { EntityId } from "../engine/ecs";
import {
	type TileCollisionMode,
	TileLayerComponent,
} from "../engine/tilemap/tile-layer-component";
import Button from "./button";
import { deleteEntity } from "./commands";
import { openImageDialog, resolveToWebPath } from "./project-io";
import type { SceneView } from "./scene-view";
import controls from "./styles/controls.module.scss";
import surface from "./styles/surface.module.scss";
import styles from "./tile-layers-panel.module.scss";
import {
	ENTITIES_ROW,
	addTileLayer,
	applyRowOrder,
	commitRowOrder,
	layerRowIds,
	renameTileLayer,
	setTileLayerCollision,
	setTileLayerTileset,
} from "./tile-layer-commands";
import Tooltip from "./tooltip";
import { useEditorValue } from "./use-editor";

const COLLISION_MODES: ReadonlyArray<
	Readonly<{ value: TileCollisionMode; label: string }>
> = [
	{ value: "none", label: "None" },
	{ value: "solid", label: "Solid" },
];

const LayerRow = ({
	view,
	id,
	layer,
	active,
	onDragStart,
	onDragEnd,
	bump,
}: Readonly<{
	view: SceneView;
	id: EntityId;
	layer: TileLayerComponent;
	active: boolean;
	onDragStart: () => void;
	onDragEnd: () => void;
	bump: () => void;
}>) => {
	const doc = view.document;
	const [editing, setEditing] = useState(false);
	const [name, setName] = useState(layer.name);

	const commitName = () => {
		setEditing(false);
		const trimmed = name.trim();
		if (trimmed && trimmed !== layer.name) {
			renameTileLayer(doc, id, trimmed);
		}
		bump();
	};

	const pickTileset = () => {
		void openImageDialog().then((path) => {
			if (path) {
				void resolveToWebPath(path).then((webPath) => {
					setTileLayerTileset(doc, id, webPath);
					bump();
				});
			}
		});
	};

	return (
		<Reorder.Item
			as="div"
			value={id}
			className={classNames(
				styles.layerRow,
				active && styles.layerRowActive,
			)}
			onPointerDown={() => view.store.setActiveLayer(id)}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
		>
			<Tooltip label={layer.visible ? "Hide layer" : "Show layer"}>
				<Button
					variant="icon"
					className={styles.layerIconButton}
					onClick={(e) => {
						e.stopPropagation();
						layer.visible = !layer.visible;
						bump();
					}}
				>
					{layer.visible ? <EyeIcon /> : <EyeSlashIcon />}
				</Button>
			</Tooltip>
			<Tooltip
				label={
					layer.tilesetRef.path
						? layer.tilesetRef.path
						: "Choose tileset…"
				}
			>
				<button
					type="button"
					className={styles.tilesetButton}
					onClick={(e) => {
						e.stopPropagation();
						pickTileset();
					}}
				>
					{layer.tilesetRef.path ? (
						<img
							src={layer.tilesetRef.path}
							alt=""
							className={styles.tilesetThumb}
						/>
					) : (
						<ImageIcon />
					)}
				</button>
			</Tooltip>
			{editing ? (
				<input
					className={styles.layerName}
					value={name}
					autoFocus
					onChange={(e) => setName(e.target.value)}
					onBlur={commitName}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							commitName();
						} else if (e.key === "Escape") {
							setName(layer.name);
							setEditing(false);
						}
					}}
				/>
			) : (
				<span
					className={styles.layerNameLabel}
					onDoubleClick={() => {
						setName(layer.name);
						setEditing(true);
					}}
				>
					{layer.name}
				</span>
			)}
			<Select.Root
				value={layer.collision}
				onValueChange={(value) => {
					setTileLayerCollision(doc, id, value as TileCollisionMode);
					bump();
				}}
			>
				<Select.Trigger
					className={classNames(
						controls.select,
						styles.collisionSelect,
					)}
					onPointerDown={(e) => e.stopPropagation()}
				>
					<Select.Value />
					<Select.Icon className={controls.selectIcon}>
						<CaretDownIcon />
					</Select.Icon>
				</Select.Trigger>
				<Select.Portal>
					<Select.Positioner
						sideOffset={4}
						align="start"
						alignItemWithTrigger={false}
					>
						<Select.Popup
							className={classNames(
								surface.surface,
								surface.menu,
								surface.selectPopup,
							)}
						>
							{COLLISION_MODES.map((mode) => (
								<Select.Item
									key={mode.value}
									value={mode.value}
									className={surface.item}
								>
									<Select.ItemText>{mode.label}</Select.ItemText>
								</Select.Item>
							))}
						</Select.Popup>
					</Select.Positioner>
				</Select.Portal>
			</Select.Root>
			<Tooltip label="Delete layer">
				<Button
					variant="icon"
					className={styles.layerIconButton}
					onClick={(e) => {
						e.stopPropagation();
						deleteEntity(doc, id);
						if (view.store.activeLayer === id) {
							view.store.setActiveLayer(null);
						}
						bump();
					}}
				>
					<TrashIcon />
				</Button>
			</Tooltip>
		</Reorder.Item>
	);
};

const TileLayersPanel = ({
	view,
	editorEnabled,
}: Readonly<{ view: SceneView; editorEnabled: boolean }>) => {
	const ecs = view.scene.ecs;
	const doc = view.document;
	const [, bump] = useReducer((x: number) => x + 1, 0);
	const activeLayer = useEditorValue(
		view.store,
		(s) => s.activeLayer,
	);
	const orderBefore = useRef<string[]>([]);

	useEffect(() => {
		const unsubEcs = ecs.subscribe(bump);
		const unsubDoc = doc.subscribe(bump);
		return () => {
			unsubEcs();
			unsubDoc();
		};
	}, [ecs, doc]);

	const rows = layerRowIds(ecs);

	return (
		<div
			className={classNames(
				styles.layersPanel,
				!editorEnabled && styles.disabled,
			)}
		>
			<div className={styles.layersHeader}>
				<span className={styles.layersHeading}>Layers</span>
				<Tooltip label="Add layer">
					<Button
						variant="icon"
						onClick={() => {
							const id = addTileLayer(doc);
							view.store.setActiveLayer(id);
						}}
					>
						<PlusIcon weight="bold" />
					</Button>
				</Tooltip>
			</div>
			<Reorder.Group
				as="div"
				axis="y"
				values={rows}
				onReorder={(ids: string[]) => {
					applyRowOrder(ecs, ids);
					bump();
				}}
				className={styles.layersGroup}
			>
				{rows.map((rowId) => {
					if (rowId === ENTITIES_ROW) {
						return (
							<Reorder.Item
								as="div"
								key={rowId}
								value={rowId}
								className={styles.entitiesRow}
							>
								<CubeIcon />
								<span>Entities</span>
							</Reorder.Item>
						);
					}
					const layer = ecs.getComponent(
						rowId as EntityId,
						TileLayerComponent,
					);
					if (!layer) {
						return null;
					}
					return (
						<LayerRow
							key={rowId}
							view={view}
							id={rowId as EntityId}
							layer={layer}
							active={rowId === activeLayer}
							onDragStart={() => {
								orderBefore.current = layerRowIds(ecs);
							}}
							onDragEnd={() => {
								commitRowOrder(
									doc,
									orderBefore.current,
									layerRowIds(ecs),
								);
							}}
							bump={bump}
						/>
					);
				})}
			</Reorder.Group>
		</div>
	);
};

export default TileLayersPanel;
