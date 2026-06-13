import {
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import classNames from "classnames";
import styles from "./timeline.module.scss";
import { EDITOR_CAMERA_ZOOM_STEP } from "../constants";
import { TimelineViewContext } from "./timeline-context";
import type {
	ClipChange,
	ClipChangeMode,
	TimelineClip,
	TimelineTrack,
} from "./timeline-types";
import type { TimelineView } from "./timeline-view";

const RULER_HEIGHT = 22;
const MIN_TICK_SPACING = 72;
const DEFAULT_HEADER_WIDTH = 160;
const MIN_TRACK_HEIGHT = 48;
const MAX_TRACK_HEIGHT = 400;
const TICK_INTERVALS = [
	0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60,
];

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

const formatSeconds = (seconds: number): string => {
	const minutes = Math.floor(seconds / 60);
	const rest = seconds - minutes * 60;
	return `${minutes}:${rest.toFixed(2).padStart(5, "0")}`;
};

type DragState = Readonly<{
	trackId: string;
	clipId: string;
	mode: ClipChangeMode;
	startClientX: number;
	origStart: number;
	origDuration: number;
}>;

type DragPreview = Readonly<{
	clipId: string;
	start: number;
	duration: number;
}>;

const Timeline = ({
	tracks,
	duration,
	playhead,
	onSeek,
	onClipPress,
	onClipChange,
	onTrackResize,
	renderClip,
	selectedClipId = null,
	clipsDraggable = true,
	headerWidth = DEFAULT_HEADER_WIDTH,
	rulerFormat = formatSeconds,
	minPxPerUnit = 1,
	maxPxPerUnit = 8000,
}: Readonly<{
	tracks: ReadonlyArray<TimelineTrack>;
	duration: number;
	playhead: number;
	onSeek: (unit: number) => void;
	onClipPress: (
		trackId: string,
		clipId: string,
		unit: number,
	) => void;
	onClipChange: (
		trackId: string,
		clipId: string,
		change: ClipChange,
		mode: ClipChangeMode,
	) => void;
	onTrackResize: (trackId: string, height: number) => void;
	renderClip: (track: TimelineTrack, clip: TimelineClip) => ReactNode;
	selectedClipId?: string | null;
	clipsDraggable?: boolean;
	headerWidth?: number;
	rulerFormat?: (unit: number) => string;
	minPxPerUnit?: number;
	maxPxPerUnit?: number;
}>) => {
	const rootRef = useRef<HTMLDivElement>(null);
	const laneRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	const [offset, setOffset] = useState(0);
	const [pxPerUnit, setPxPerUnit] = useState(0);
	const [preview, setPreview] = useState<DragPreview | null>(null);

	const offsetRef = useRef(0);
	const pxPerUnitRef = useRef(0);
	offsetRef.current = offset;
	pxPerUnitRef.current = pxPerUnit;

	const span = Math.max(duration, 0.001);

	const applyOffset = (next: number): void => {
		setOffset(Math.max(0, next));
	};

	useEffect(() => {
		const lane = laneRef.current;
		if (!lane) {
			return;
		}
		const observer = new ResizeObserver(() => {
			const next = lane.clientWidth;
			setWidth(next);
			if (pxPerUnitRef.current === 0 && next > 0) {
				setPxPerUnit(clamp(next / span, minPxPerUnit, maxPxPerUnit));
			}
		});
		observer.observe(lane);
		return () => observer.disconnect();
	}, [span, minPxPerUnit, maxPxPerUnit]);

	useEffect(() => {
		const root = rootRef.current;
		const lane = laneRef.current;
		if (!root || !lane) {
			return;
		}
		const onWheel = (event: WheelEvent): void => {
			event.preventDefault();
			const rect = lane.getBoundingClientRect();
			const px = pxPerUnitRef.current;
			if (event.shiftKey) {
				applyOffset(
					offsetRef.current + event.deltaY / Math.max(px, 0.000001),
				);
				return;
			}
			const mouseX = Math.max(0, event.clientX - rect.left);
			const before =
				mouseX / Math.max(px, 0.000001) + offsetRef.current;
			const next = clamp(
				px * EDITOR_CAMERA_ZOOM_STEP ** -event.deltaY,
				minPxPerUnit,
				maxPxPerUnit,
			);
			const after = mouseX / next + offsetRef.current;
			setPxPerUnit(next);
			setOffset(Math.max(0, offsetRef.current + before - after));
		};
		root.addEventListener("wheel", onWheel, { passive: false });
		return () => root.removeEventListener("wheel", onWheel);
	}, [minPxPerUnit, maxPxPerUnit]);

	const view: TimelineView = useMemo(
		() => ({
			unitToX: (unit) => (unit - offset) * pxPerUnit,
			xToUnit: (x) => x / Math.max(pxPerUnit, 0.000001) + offset,
			pxPerUnit,
			offset,
			width,
			height: 0,
		}),
		[offset, pxPerUnit, width],
	);

	const dragRef = useRef<DragState | null>(null);
	const scrubRef = useRef(false);
	const resizeRef = useRef<{
		trackId: string;
		startY: number;
		startHeight: number;
	} | null>(null);

	const laneX = (clientX: number): number => {
		const rect = laneRef.current?.getBoundingClientRect();
		return rect ? clientX - rect.left : 0;
	};

	const ticks = useMemo(() => {
		if (pxPerUnit <= 0 || width <= 0) {
			return [];
		}
		const interval =
			TICK_INTERVALS.find((t) => t * pxPerUnit >= MIN_TICK_SPACING) ??
			TICK_INTERVALS[TICK_INTERVALS.length - 1]!;
		const start = Math.floor(offset / interval) * interval;
		const end = offset + width / pxPerUnit;
		const result: number[] = [];
		for (let t = start; t <= end; t += interval) {
			result.push(t);
		}
		return result;
	}, [offset, pxPerUnit, width]);

	const onClipPointerDown = (
		event: React.PointerEvent,
		track: TimelineTrack,
		clip: TimelineClip,
	): void => {
		event.stopPropagation();
		const unit = view.xToUnit(laneX(event.clientX));
		onClipPress(track.id, clip.id, unit);
		if (!clipsDraggable) {
			return;
		}
		const thumb = (event.target as HTMLElement).dataset.thumb;
		const mode: ClipChangeMode =
			thumb === "start"
				? "trim-start"
				: thumb === "end"
					? "trim-end"
					: "move";
		dragRef.current = {
			trackId: track.id,
			clipId: clip.id,
			mode,
			startClientX: event.clientX,
			origStart: clip.start,
			origDuration: clip.duration,
		};
		setPreview({
			clipId: clip.id,
			start: clip.start,
			duration: clip.duration,
		});
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const onClipPointerMove = (event: React.PointerEvent): void => {
		const drag = dragRef.current;
		if (!drag) {
			return;
		}
		const dx =
			(event.clientX - drag.startClientX) /
			Math.max(pxPerUnit, 0.000001);
		if (drag.mode === "move") {
			setPreview({
				clipId: drag.clipId,
				start: Math.max(0, drag.origStart + dx),
				duration: drag.origDuration,
			});
		} else if (drag.mode === "trim-start") {
			const start = clamp(
				drag.origStart + dx,
				0,
				drag.origStart + drag.origDuration - 0.01,
			);
			setPreview({
				clipId: drag.clipId,
				start,
				duration: drag.origStart + drag.origDuration - start,
			});
		} else {
			setPreview({
				clipId: drag.clipId,
				start: drag.origStart,
				duration: Math.max(0.01, drag.origDuration + dx),
			});
		}
	};

	const onClipPointerUp = (event: React.PointerEvent): void => {
		const drag = dragRef.current;
		dragRef.current = null;
		event.currentTarget.releasePointerCapture(event.pointerId);
		const current = preview;
		setPreview(null);
		if (!drag || !current) {
			return;
		}
		if (
			current.start !== drag.origStart ||
			current.duration !== drag.origDuration
		) {
			onClipChange(
				drag.trackId,
				drag.clipId,
				{ start: current.start, duration: current.duration },
				drag.mode,
			);
		}
	};

	const onResizePointerDown = (
		event: React.PointerEvent,
		track: TimelineTrack,
	): void => {
		resizeRef.current = {
			trackId: track.id,
			startY: event.clientY,
			startHeight: track.height,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const onResizePointerMove = (event: React.PointerEvent): void => {
		const resize = resizeRef.current;
		if (!resize) {
			return;
		}
		onTrackResize(
			resize.trackId,
			clamp(
				resize.startHeight + (event.clientY - resize.startY),
				MIN_TRACK_HEIGHT,
				MAX_TRACK_HEIGHT,
			),
		);
	};

	const onResizePointerUp = (event: React.PointerEvent): void => {
		resizeRef.current = null;
		event.currentTarget.releasePointerCapture(event.pointerId);
	};

	const gridTemplateRows = [
		RULER_HEIGHT,
		...tracks.map((t) => t.height),
	]
		.map((h) => `${h}px`)
		.join(" ");

	return (
		<div
			ref={rootRef}
			className={styles.timeline}
			style={{
				gridTemplateColumns: `${headerWidth}px 1fr`,
				gridTemplateRows,
			}}
		>
			<TimelineViewContext.Provider value={view}>
				<div className={styles.timelineCorner} />
				<div
					ref={laneRef}
					className={styles.timelineRuler}
					onPointerDown={(e) => {
						scrubRef.current = true;
						onSeek(
							clamp(view.xToUnit(laneX(e.clientX)), 0, duration),
						);
						e.currentTarget.setPointerCapture(e.pointerId);
					}}
					onPointerMove={(e) => {
						if (scrubRef.current) {
							onSeek(
								clamp(view.xToUnit(laneX(e.clientX)), 0, duration),
							);
						}
					}}
					onPointerUp={(e) => {
						scrubRef.current = false;
						e.currentTarget.releasePointerCapture(e.pointerId);
					}}
				>
					{ticks.map((t) => (
						<div
							key={t}
							className={styles.timelineTick}
							style={{ left: view.unitToX(t) }}
						>
							{rulerFormat(t)}
						</div>
					))}
				</div>

				{tracks.map((track, index) => (
					<div
						key={`header:${track.id}`}
						className={styles.timelineTrackHeader}
						style={{ gridColumn: 1, gridRow: index + 2 }}
					>
						<span className={styles.timelineTrackName}>
							{track.name}
						</span>
						<div
							className={styles.timelineTrackResizeHandle}
							onPointerDown={(e) => onResizePointerDown(e, track)}
							onPointerMove={onResizePointerMove}
							onPointerUp={onResizePointerUp}
						/>
					</div>
				))}

				{tracks.map((track, index) => (
					<div
						key={`lane:${track.id}`}
						className={styles.timelineLane}
						style={{ gridColumn: 2, gridRow: index + 2 }}
						onPointerDown={(e) => {
							if (e.target === e.currentTarget) {
								onSeek(
									clamp(view.xToUnit(laneX(e.clientX)), 0, duration),
								);
							}
						}}
					>
						{track.clips.map((clip) => {
							const active =
								preview && preview.clipId === clip.id
									? preview
									: clip;
							const left = view.unitToX(active.start);
							const clipWidth = active.duration * pxPerUnit;
							return (
								<div
									key={clip.id}
									className={classNames(
										styles.timelineClip,
										selectedClipId === clip.id &&
											styles.timelineClipSelected,
									)}
									style={{
										left,
										width: clipWidth,
										background: clip.color ?? track.color,
									}}
									onPointerDown={(e) =>
										onClipPointerDown(e, track, clip)
									}
									onPointerMove={onClipPointerMove}
									onPointerUp={onClipPointerUp}
								>
									{renderClip(track, clip)}
									<div
										className={classNames(
											styles.timelineClipThumb,
											styles.timelineClipThumbStart,
										)}
										data-thumb="start"
									/>
									<div
										className={classNames(
											styles.timelineClipThumb,
											styles.timelineClipThumbEnd,
										)}
										data-thumb="end"
									/>
								</div>
							);
						})}
					</div>
				))}

				<div className={styles.timelinePlayhead}>
					<div
						className={styles.timelinePlayheadLine}
						style={{ left: view.unitToX(playhead) }}
					>
						<div
							className={styles.timelinePlayheadHandle}
							onPointerDown={(e) => {
								scrubRef.current = true;
								e.currentTarget.setPointerCapture(e.pointerId);
							}}
							onPointerMove={(e) => {
								if (scrubRef.current) {
									onSeek(
										clamp(
											view.xToUnit(laneX(e.clientX)),
											0,
											duration,
										),
									);
								}
							}}
							onPointerUp={(e) => {
								scrubRef.current = false;
								e.currentTarget.releasePointerCapture(e.pointerId);
							}}
						/>
					</div>
				</div>
			</TimelineViewContext.Provider>
		</div>
	);
};

export default Timeline;
