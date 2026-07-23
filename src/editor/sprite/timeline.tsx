import { NumberField } from "@base-ui/react/number-field";
import { Popover } from "@base-ui/react/popover";
import { Select } from "@base-ui/react/select";
import {
	CaretDownIcon,
	CopyIcon,
	DotsSixVerticalIcon,
	EyeIcon,
	EyeSlashIcon,
	PlusIcon,
	RepeatIcon,
	TagIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import {
	type CSSProperties,
	type DragEvent as ReactDragEvent,
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { BspriteTag } from "../../engine/sprite/bsprite-manifest";
import Button from "../button";
import GradientSlider from "../color/gradient-slider";
import SliderValue from "../color/slider-value";
import type { DocumentViewState } from "../document/document-view-state";
import type { History } from "../history";
import controls from "../styles/controls.module.scss";
import surface from "../styles/surface.module.scss";
import Tooltip from "../tooltip";
import { usePortalContainer } from "../window/portal-container";
import { BLEND_MODES } from "./blend-modes";
import CelThumbnail from "./cel-thumbnail";
import { moveCel } from "./cel-commands";
import {
	addFrame,
	deleteFrame,
	duplicateFrame,
	moveFrame,
	setFrameDuration,
} from "./frame-commands";
import {
	commitLayerOpacity,
	commitLayerOrder,
	addLayer,
	deleteLayer,
	renameLayer,
	setLayerBlend,
	setLayerVisible,
} from "./layer-commands";
import LayerThumbnail from "./layer-thumbnail";
import OnionControl from "./onion-control";
import type { OnionState } from "./onion-state";
import type { LayerView, SpriteDocument } from "./sprite-document";
import {
	createTag,
	deleteTag,
	renameTag,
	setTagLoop,
	setTagRange,
} from "./tag-commands";
import { frameColumnAt, resizeTagRange } from "./timeline-geometry";
import styles from "./timeline.module.scss";

/**
 * What the timeline is currently dragging, tracked module-side because the
 * HTML5 `dragover` phase cannot read `dataTransfer` payloads — only the drop
 * target's kind guard can decide whether a given drop applies.
 */
type TimelineDrag =
	| Readonly<{ kind: "layer"; id: string; before: readonly string[] }>
	| Readonly<{ kind: "frame"; index: number }>
	| Readonly<{ kind: "cel"; layerId: string; frameIndex: number }>;

let dragState: TimelineDrag | null = null;

const beginDrag = (e: ReactDragEvent, drag: TimelineDrag): void => {
	dragState = drag;
	e.dataTransfer.effectAllowed = "move";
	e.dataTransfer.setData("text/plain", "");
};

const gridColumn = (frame: number): number => 2 + frame;
const gridRow = (row: number): number => 3 + row;

const FrameDurationField = ({
	value,
	onCommit,
}: Readonly<{ value: number; onCommit: (n: number) => void }>) => (
	<NumberField.Root
		className={styles.duration}
		value={value}
		min={1}
		onValueCommitted={(next) => {
			if (next !== null && Number.isFinite(next) && next > 0) {
				onCommit(next);
			}
		}}
	>
		<NumberField.Group className={styles.durationGroup}>
			<NumberField.Input
				className={styles.durationInput}
				aria-label="Frame duration in milliseconds"
			/>
			<span className={styles.durationUnit}>ms</span>
		</NumberField.Group>
	</NumberField.Root>
);

const FrameHeaderCell = ({
	doc,
	history,
	index,
	duration,
	active,
}: Readonly<{
	doc: SpriteDocument;
	history: History;
	index: number;
	duration: number;
	active: boolean;
}>) => (
	<div
		className={clsx(
			styles.frameHeader,
			active && styles.frameHeaderActive,
		)}
		style={{ gridColumn: gridColumn(index), gridRow: 2 }}
		onPointerDown={() => doc.setActiveFrame(index)}
		onDragOver={(e) => {
			if (dragState?.kind === "frame") {
				e.preventDefault();
			}
		}}
		onDrop={(e) => {
			if (dragState?.kind === "frame") {
				e.preventDefault();
				moveFrame(doc, history, dragState.index, index);
			}
		}}
	>
		<div className={styles.frameHeaderTop}>
			<span
				className={styles.dragHandle}
				draggable
				onDragStart={(e) => beginDrag(e, { kind: "frame", index })}
				onDragEnd={() => {
					dragState = null;
				}}
				aria-label="Reorder frame"
			>
				<DotsSixVerticalIcon />
			</span>
			<span className={styles.frameIndex}>{index + 1}</span>
		</div>
		<FrameDurationField
			value={duration}
			onCommit={(next) => setFrameDuration(doc, history, index, next)}
		/>
	</div>
);

const CelCell = ({
	doc,
	history,
	layerId,
	frameIndex,
	row,
	activeCel,
	columnActive,
	version,
	elementRef,
}: Readonly<{
	doc: SpriteDocument;
	history: History;
	layerId: string;
	frameIndex: number;
	row: number;
	activeCel: boolean;
	columnActive: boolean;
	version: number;
	elementRef?: RefObject<HTMLDivElement | null>;
}>) => (
	<div
		ref={elementRef}
		className={clsx(
			styles.celCell,
			columnActive && styles.celCellColumnActive,
			activeCel && styles.celCellActive,
		)}
		style={{
			gridColumn: gridColumn(frameIndex),
			gridRow: gridRow(row),
		}}
		draggable
		onPointerDown={() => {
			doc.setActiveLayer(layerId);
			doc.setActiveFrame(frameIndex);
		}}
		onDragStart={(e) =>
			beginDrag(e, { kind: "cel", layerId, frameIndex })
		}
		onDragEnd={() => {
			dragState = null;
		}}
		onDragOver={(e) => {
			if (dragState?.kind === "cel") {
				e.preventDefault();
				e.dataTransfer.dropEffect = e.altKey ? "copy" : "move";
			}
		}}
		onDrop={(e) => {
			if (dragState?.kind === "cel") {
				e.preventDefault();
				moveCel(
					doc,
					history,
					{
						layerId: dragState.layerId,
						frameIndex: dragState.frameIndex,
					},
					{ layerId, frameIndex },
					e.altKey,
				);
			}
		}}
	>
		<CelThumbnail
			source={doc.getCel(layerId, frameIndex)}
			width={doc.width}
			height={doc.height}
			size={36}
			version={version}
		/>
	</div>
);

const LayerAxisRow = ({
	doc,
	history,
	layer,
	row,
	active,
	canDelete,
	version,
}: Readonly<{
	doc: SpriteDocument;
	history: History;
	layer: LayerView;
	row: number;
	active: boolean;
	canDelete: boolean;
	version: number;
}>) => {
	const [editing, setEditing] = useState(false);
	const [name, setName] = useState(layer.name);
	const beforeOpacity = useRef<number | null>(null);
	const container = usePortalContainer();

	const commitName = () => {
		setEditing(false);
		renameLayer(doc, history, layer.id, name.trim() || layer.name);
	};

	const dropLayer = (targetId: string) => {
		if (dragState?.kind !== "layer" || dragState.id === targetId) {
			return;
		}
		const display = [...dragState.before].reverse();
		const dragged = dragState.id;
		const without = display.filter((id) => id !== dragged);
		const at = without.indexOf(targetId);
		without.splice(at < 0 ? without.length : at, 0, dragged);
		commitLayerOrder(
			doc,
			history,
			dragState.before,
			[...without].reverse(),
		);
	};

	return (
		<div
			className={clsx(
				styles.layerAxis,
				active && styles.layerAxisActive,
			)}
			style={{ gridColumn: 1, gridRow: gridRow(row) }}
			onPointerDown={() => doc.setActiveLayer(layer.id)}
			onDragOver={(e) => {
				if (dragState?.kind === "layer") {
					e.preventDefault();
				}
			}}
			onDrop={(e) => {
				if (dragState?.kind === "layer") {
					e.preventDefault();
					dropLayer(layer.id);
				}
			}}
		>
			<span
				className={styles.dragHandle}
				draggable
				onDragStart={(e) =>
					beginDrag(e, {
						kind: "layer",
						id: layer.id,
						before: doc.layers.map((l) => l.id),
					})
				}
				onDragEnd={() => {
					dragState = null;
				}}
				aria-label="Reorder layer"
			>
				<DotsSixVerticalIcon />
			</span>
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
					className={clsx(controls.select, styles.blendSelect)}
					onPointerDown={(e) => e.stopPropagation()}
				>
					<Select.Value />
					<Select.Icon className={controls.selectIcon}>
						<CaretDownIcon />
					</Select.Icon>
				</Select.Trigger>
				<Select.Portal container={container}>
					<Select.Positioner
						sideOffset={4}
						align="start"
						alignItemWithTrigger={false}
					>
						<Select.Popup
							className={clsx(
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
					<Popover.Trigger
						className={styles.opacityTrigger}
						onPointerDown={(e) => e.stopPropagation()}
					>
						{Math.round(layer.opacity * 100)}%
					</Popover.Trigger>
				</Tooltip>
				<Popover.Portal container={container}>
					<Popover.Positioner sideOffset={8}>
						<Popover.Popup
							className={clsx(surface.surface, styles.opacityPopup)}
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
		</div>
	);
};

const TagBar = ({
	doc,
	history,
	tag,
	index,
	frameCount,
	laneRef,
}: Readonly<{
	doc: SpriteDocument;
	history: History;
	tag: BspriteTag;
	index: number;
	frameCount: number;
	laneRef: RefObject<HTMLDivElement | null>;
}>) => {
	const [editing, setEditing] = useState(false);
	const [name, setName] = useState(tag.name);

	const commitName = () => {
		setEditing(false);
		renameTag(doc, history, index, name.trim() || tag.name);
	};

	// Live-preview the range while dragging an edge, then reset and record one
	// undoable command so the whole gesture is a single history entry.
	const startEdgeDrag = (
		e: ReactPointerEvent,
		edge: "from" | "to",
	) => {
		e.stopPropagation();
		e.preventDefault();
		const handle = e.currentTarget as HTMLElement;
		handle.setPointerCapture(e.pointerId);
		const origin = { from: tag.from, to: tag.to };
		let latest = origin;
		const move = (ev: PointerEvent) => {
			const lane = laneRef.current;
			if (!lane) {
				return;
			}
			const rect = lane.getBoundingClientRect();
			const colWidth = rect.width / frameCount;
			const target = frameColumnAt(
				ev.clientX - rect.left,
				colWidth,
				frameCount,
			);
			latest = resizeTagRange(
				origin.from,
				origin.to,
				edge,
				target,
				frameCount,
			);
			doc.setTagRange(index, latest.from, latest.to);
		};
		const up = () => {
			handle.removeEventListener("pointermove", move);
			handle.removeEventListener("pointerup", up);
			doc.setTagRange(index, origin.from, origin.to);
			setTagRange(doc, history, index, latest.from, latest.to);
		};
		handle.addEventListener("pointermove", move);
		handle.addEventListener("pointerup", up);
	};

	return (
		<div
			className={styles.tagBar}
			style={{ gridColumn: `${tag.from + 1} / ${tag.to + 2}` }}
		>
			<span
				className={clsx(styles.tagHandle, styles.tagHandleStart)}
				onPointerDown={(e) => startEdgeDrag(e, "from")}
				aria-label="Drag tag start"
			/>
			{editing ? (
				<input
					className={styles.tagNameInput}
					value={name}
					autoFocus
					onChange={(e) => setName(e.target.value)}
					onBlur={commitName}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							commitName();
						} else if (e.key === "Escape") {
							setName(tag.name);
							setEditing(false);
						}
					}}
				/>
			) : (
				<span
					className={styles.tagName}
					onDoubleClick={() => {
						setName(tag.name);
						setEditing(true);
					}}
				>
					{tag.name}
				</span>
			)}
			<Tooltip label={tag.loop ? "Looping" : "Play once"}>
				<button
					type="button"
					className={styles.tagButton}
					data-on={tag.loop ? "" : undefined}
					onClick={() => setTagLoop(doc, history, index, !tag.loop)}
					aria-label="Toggle loop"
				>
					<RepeatIcon />
				</button>
			</Tooltip>
			<Tooltip label="Delete tag">
				<button
					type="button"
					className={styles.tagButton}
					onClick={() => deleteTag(doc, history, index)}
					aria-label="Delete tag"
				>
					<XIcon />
				</button>
			</Tooltip>
			<span
				className={clsx(styles.tagHandle, styles.tagHandleEnd)}
				onPointerDown={(e) => startEdgeDrag(e, "to")}
				aria-label="Drag tag end"
			/>
		</div>
	);
};

/**
 * The sprite editor's timeline: a frames × layers grid whose left column is the
 * (rebuilt) layers axis and whose columns are frames. Each grid cell is a cel
 * ({@link CelThumbnail}); a tag lane spans the frame columns above the header.
 *
 * All edits route through the existing command factories so every operation is
 * a single undoable history entry: layer add/delete/rename/reorder/visibility/
 * blend/opacity (`layer-commands`), frame add/delete/duplicate/reorder and
 * per-frame duration (`frame-commands`), tag create/rename/range/loop/delete
 * (`tag-commands`), and cel move/copy drag (`cel-commands`).
 */
const Timeline = ({
	doc,
	history,
	onion,
	viewState,
}: Readonly<{
	doc: SpriteDocument;
	history: History;
	onion: OnionState;
	viewState: DocumentViewState;
}>) => {
	const version = useSyncExternalStore(
		doc.subscribe,
		() => doc.version,
	);
	const laneRef = useRef<HTMLDivElement | null>(null);
	const activeCelRef = useRef<HTMLDivElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);

	// Restore the scroll offset a prior mount recorded (a cross-window move
	// remounts the timeline). With none recorded — a fresh view — leave the grid
	// at its natural origin, exactly as before, and let the active-cel effect
	// below govern visibility.
	useEffect(() => {
		const scroll = viewState.timelineScroll;
		if (scroll && scrollRef.current) {
			scrollRef.current.scrollLeft = scroll.left;
			scrollRef.current.scrollTop = scroll.top;
		}
	}, [viewState]);

	const frames = doc.frames;
	const frameCount = frames.length;
	const activeFrame = doc.activeFrameIndex;
	const activeLayer = doc.activeLayerId;
	const layers = [...doc.layers].reverse();
	const tags = doc.tags;

	// Keep the active cel visible as it moves (arrow-key navigation or a click on
	// a partly-scrolled cell). `nearest` leaves an already-visible cell put, so a
	// click never jumps the grid.
	useEffect(() => {
		activeCelRef.current?.scrollIntoView({
			block: "nearest",
			inline: "nearest",
		});
	}, [activeFrame, activeLayer]);

	const gridStyle: CSSProperties = {
		gridTemplateColumns: `var(--axis-width) repeat(${frameCount}, var(--col-width))`,
		gridTemplateRows: `auto auto repeat(${layers.length}, var(--row-height))`,
	};

	return (
		<div className={styles.timeline}>
			<div className={styles.toolbar}>
				<span className={styles.toolbarHeading}>Timeline</span>
				<Tooltip label="New tag (spans all frames)">
					<Button
						variant="icon"
						onClick={() =>
							createTag(doc, history, {
								name: "tag",
								from: 0,
								to: frameCount - 1,
								loop: true,
							})
						}
					>
						<TagIcon />
					</Button>
				</Tooltip>
				<div className={controls.toolbarSeparator} />
				<OnionControl onion={onion} />
				<div className={controls.toolbarSeparator} />
				<Tooltip label="Add layer">
					<Button
						variant="icon"
						onClick={() => addLayer(doc, history)}
					>
						<PlusIcon weight="bold" />
					</Button>
				</Tooltip>
				<div className={controls.toolbarSeparator} />
				<Tooltip label="Add frame">
					<Button
						variant="icon"
						onClick={() => addFrame(doc, history, activeFrame)}
					>
						<PlusIcon weight="bold" />
					</Button>
				</Tooltip>
				<Tooltip label="Duplicate frame">
					<Button
						variant="icon"
						onClick={() => duplicateFrame(doc, history, activeFrame)}
					>
						<CopyIcon />
					</Button>
				</Tooltip>
				<Tooltip label="Delete frame">
					<Button
						variant="icon"
						disabled={frameCount <= 1}
						onClick={() => deleteFrame(doc, history, activeFrame)}
					>
						<TrashIcon />
					</Button>
				</Tooltip>
			</div>
			<div
				ref={scrollRef}
				className={styles.scroll}
				onScroll={(e) =>
					viewState.setTimelineScroll({
						left: e.currentTarget.scrollLeft,
						top: e.currentTarget.scrollTop,
					})
				}
			>
				<div className={styles.grid} style={gridStyle}>
					<div
						className={styles.corner}
						style={{ gridColumn: 1, gridRow: "1 / 3" }}
					>
						<span className={styles.cornerLabel}>
							{layers.length} layer{layers.length === 1 ? "" : "s"} ·{" "}
							{frameCount} frame{frameCount === 1 ? "" : "s"}
						</span>
					</div>
					<div
						ref={laneRef}
						className={styles.tagLane}
						style={{
							gridColumn: "2 / -1",
							gridRow: 1,
							gridTemplateColumns: `repeat(${frameCount}, var(--col-width))`,
						}}
					>
						{tags.map((tag, i) => (
							<TagBar
								key={`${i}-${tag.name}`}
								doc={doc}
								history={history}
								tag={tag}
								index={i}
								frameCount={frameCount}
								laneRef={laneRef}
							/>
						))}
					</div>
					{frames.map((frame, i) => (
						<FrameHeaderCell
							key={i}
							doc={doc}
							history={history}
							index={i}
							duration={frame.duration}
							active={i === activeFrame}
						/>
					))}
					{layers.map((layer, r) => (
						<LayerAxisRow
							key={layer.id}
							doc={doc}
							history={history}
							layer={layer}
							row={r}
							active={layer.id === activeLayer}
							canDelete={layers.length > 1}
							version={version}
						/>
					))}
					{layers.map((layer, r) =>
						frames.map((_frame, i) => {
							const activeCel =
								layer.id === activeLayer && i === activeFrame;
							return (
								<CelCell
									key={`${layer.id}-${i}`}
									doc={doc}
									history={history}
									layerId={layer.id}
									frameIndex={i}
									row={r}
									activeCel={activeCel}
									columnActive={i === activeFrame}
									version={version}
									elementRef={activeCel ? activeCelRef : undefined}
								/>
							);
						}),
					)}
				</div>
			</div>
		</div>
	);
};

export default Timeline;
