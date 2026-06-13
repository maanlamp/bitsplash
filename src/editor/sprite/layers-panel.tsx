import { Popover } from "@base-ui/react/popover";
import { Select } from "@base-ui/react/select";
import {
	CaretDownIcon,
	EyeIcon,
	EyeSlashIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import classNames from "classnames";
import { Reorder } from "motion/react";
import { useRef, useState, useSyncExternalStore } from "react";
import Button from "../button";
import type { History } from "../history";
import controls from "../styles/controls.module.scss";
import surface from "../styles/surface.module.scss";
import Tooltip from "../tooltip";
import { BLEND_MODES } from "./blend-modes";
import GradientSlider from "./gradient-slider";
import {
	addLayer,
	commitLayerOpacity,
	commitLayerOrder,
	deleteLayer,
	renameLayer,
	setLayerBlend,
	setLayerVisible,
} from "./layer-commands";
import LayerThumbnail from "./layer-thumbnail";
import styles from "./layers-panel.module.scss";
import SliderValue from "./slider-value";
import type { LayerView, SpriteDocument } from "./sprite-document";

const LayerRow = ({
	doc,
	history,
	layer,
	active,
	canDelete,
	version,
}: Readonly<{
	doc: SpriteDocument;
	history: History;
	layer: LayerView;
	active: boolean;
	canDelete: boolean;
	version: number;
}>) => {
	const [editing, setEditing] = useState(false);
	const [name, setName] = useState(layer.name);
	const beforeOpacity = useRef<number | null>(null);
	const orderBefore = useRef<string[]>([]);

	const commitName = () => {
		setEditing(false);
		renameLayer(doc, history, layer.id, name.trim() || layer.name);
	};

	return (
		<Reorder.Item
			as="div"
			value={layer.id}
			className={classNames(
				styles.layerRow,
				active && styles.layerRowActive,
			)}
			onPointerDown={() => doc.setActiveLayer(layer.id)}
			onDragStart={() => {
				orderBefore.current = doc.layers.map((l) => l.id);
			}}
			onDragEnd={() => {
				commitLayerOrder(
					doc,
					history,
					orderBefore.current,
					doc.layers.map((l) => l.id),
				);
			}}
		>
			<Tooltip label={layer.visible ? "Hide layer" : "Show layer"}>
				<Button
					variant="icon"
					className={styles.layerIconButton}
					onClick={(e) => {
						e.stopPropagation();
						setLayerVisible(doc, history, layer.id, !layer.visible);
					}}
				>
					{layer.visible ? <EyeIcon /> : <EyeSlashIcon />}
				</Button>
			</Tooltip>
			<LayerThumbnail
				source={layer.canvas}
				width={doc.width}
				height={doc.height}
				version={version}
			/>
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
				value={layer.blend}
				onValueChange={(v) =>
					setLayerBlend(
						doc,
						history,
						layer.id,
						v as LayerView["blend"],
					)
				}
			>
				<Select.Trigger
					className={classNames(controls.select, styles.blendSelect)}
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
							{BLEND_MODES.map((mode) => (
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
			<Popover.Root>
				<Tooltip label="Opacity">
					<Popover.Trigger className={styles.opacityTrigger}>
						{Math.round(layer.opacity * 100)}%
					</Popover.Trigger>
				</Tooltip>
				<Popover.Portal>
					<Popover.Positioner sideOffset={8}>
						<Popover.Popup
							className={classNames(
								surface.surface,
								styles.opacityPopup,
							)}
						>
							<GradientSlider
								value={layer.opacity}
								background="linear-gradient(to right, transparent, var(--color-neutral-1000)), var(--checker)"
								display={
									<SliderValue
										value={layer.opacity}
										format={{
											style: "percent",
											maximumFractionDigits: 0,
										}}
									/>
								}
								onChange={(v) => {
									if (beforeOpacity.current === null) {
										beforeOpacity.current = layer.opacity;
									}
									doc.setOpacity(layer.id, v);
								}}
								onCommit={() => {
									const before =
										beforeOpacity.current ?? layer.opacity;
									beforeOpacity.current = null;
									commitLayerOpacity(
										doc,
										history,
										layer.id,
										before,
										layer.opacity,
									);
								}}
							/>
						</Popover.Popup>
					</Popover.Positioner>
				</Popover.Portal>
			</Popover.Root>
			<Tooltip label="Delete layer">
				<Button
					variant="icon"
					className={styles.layerIconButton}
					disabled={!canDelete}
					onClick={(e) => {
						e.stopPropagation();
						deleteLayer(doc, history, layer.id);
					}}
				>
					<TrashIcon />
				</Button>
			</Tooltip>
		</Reorder.Item>
	);
};

const LayersPanel = ({
	doc,
	history,
}: Readonly<{ doc: SpriteDocument; history: History }>) => {
	const version = useSyncExternalStore(
		doc.subscribe,
		() => doc.version,
	);
	const activeId = doc.activeLayerId;
	const ordered = [...doc.layers].reverse();
	const orderedIds = ordered.map((l) => l.id);

	return (
		<div className={styles.layersPanel}>
			<div className={styles.layersHeader}>
				<span className={styles.layersHeading}>Layers</span>
				<Tooltip label="Add layer">
					<Button
						variant="icon"
						onClick={() => addLayer(doc, history)}
					>
						<PlusIcon weight="bold" />
					</Button>
				</Tooltip>
			</div>
			<Reorder.Group
				as="div"
				axis="y"
				values={orderedIds}
				onReorder={(ids: string[]) =>
					doc.setLayerOrder([...ids].reverse())
				}
				className={styles.layersGroup}
			>
				{ordered.map((layer) => (
					<LayerRow
						key={layer.id}
						doc={doc}
						history={history}
						layer={layer}
						active={layer.id === activeId}
						canDelete={doc.layers.length > 1}
						version={version}
					/>
				))}
			</Reorder.Group>
		</div>
	);
};

export default LayersPanel;
