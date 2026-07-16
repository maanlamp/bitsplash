import {
	type PerfHistory,
	type PerfSeries,
	type PerfStats,
} from "./perf-history";

/** Per-metric configuration for one {@link drawPerfWidget} panel. */
export type WidgetSpec = Readonly<{
	/** Metric name shown top-left (e.g. "FPS", "Update", "Memory"). */
	name: string;
	/** Which history series the graph and min/avg/max read. */
	series: PerfSeries;
	/** Vibrant line + fill hue for this metric. */
	color: string;
	/** Autoscale floor so a quiet graph does not amplify noise to full height. */
	minScale: number;
	/** The big headline value (e.g. current fps, current ms, current MB). */
	headline: (history: PerfHistory, stats: PerfStats) => string;
	/** Formats a series value for the min/avg/max footer. */
	format: (value: number) => string;
	/** Whether the window is spiking, which recolors the line. */
	spike: (stats: PerfStats) => boolean;
}>;

export const WIDGET_WIDTH = 150;
export const WIDGET_HEIGHT = 78;

const PAD = 8;
const NAME_BASELINE = 15;
const GRAPH_TOP = 22;
const GRAPH_BOTTOM = 58;
const FOOTER_BASELINE = 71;

const SPIKE_COLOR = "#e0795f";
const TEXT_COLOR = "#cfd8dc";
const MUTED_COLOR = "rgba(207, 216, 220, 0.55)";

/** 60fps frame budget, the natural autoscale floor for time-based metrics. */
export const TARGET_MS = 1000 / 60;

/**
 * Append a Catmull-Rom spline through `pts` (screen coords) to the current path,
 * starting with a `moveTo` to the first point. Gives a smooth curve over the
 * **raw** samples — spikes keep their full height, so spike-coloring still works.
 */
const appendSpline = (
	ctx: CanvasRenderingContext2D,
	pts: ReadonlyArray<readonly [number, number]>,
): void => {
	if (pts.length === 0) {
		return;
	}
	ctx.moveTo(pts[0]![0], pts[0]![1]);
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[i - 1] ?? pts[i]!;
		const p1 = pts[i]!;
		const p2 = pts[i + 1]!;
		const p3 = pts[i + 2] ?? p2;
		const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
		const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
		const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
		const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
		ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
	}
};

/**
 * Draw one perf widget onto a 2D context already scaled to CSS pixels: rounded
 * translucent panel, metric name, headline value, a smooth gradient-filled graph
 * over the raw window, and a rolling min/avg/max footer.
 */
export const drawPerfWidget = (
	ctx: CanvasRenderingContext2D,
	spec: WidgetSpec,
	history: PerfHistory,
): void => {
	ctx.clearRect(0, 0, WIDGET_WIDTH, WIDGET_HEIGHT);

	const stats = history.stats(spec.series);
	const spiking = spec.spike(stats);
	const lineColor = spiking ? SPIKE_COLOR : spec.color;

	ctx.font = "600 10px system-ui, sans-serif";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = MUTED_COLOR;
	ctx.textAlign = "left";
	ctx.fillText(spec.name.toUpperCase(), PAD, NAME_BASELINE);

	ctx.font = "700 13px system-ui, sans-serif";
	ctx.fillStyle = spiking ? SPIKE_COLOR : TEXT_COLOR;
	ctx.textAlign = "right";
	ctx.fillText(
		spec.headline(history, stats),
		WIDGET_WIDTH - PAD,
		NAME_BASELINE + 1,
	);

	const graphW = WIDGET_WIDTH - PAD * 2;
	const graphH = GRAPH_BOTTOM - GRAPH_TOP;
	const scaleMax = Math.max(stats.max * 1.15, spec.minScale);
	const count = history.length;

	if (count > 1) {
		const pts: Array<readonly [number, number]> = [];
		for (let i = 0; i < count; i++) {
			const v = history.sampleAt(spec.series, i);
			const x = PAD + (i / (count - 1)) * graphW;
			const y =
				GRAPH_BOTTOM - (Math.min(v, scaleMax) / scaleMax) * graphH;
			pts.push([x, y]);
		}

		const fill = ctx.createLinearGradient(
			0,
			GRAPH_TOP,
			0,
			GRAPH_BOTTOM,
		);
		fill.addColorStop(0, `${lineColor}66`);
		fill.addColorStop(1, `${lineColor}00`);
		ctx.beginPath();
		appendSpline(ctx, pts);
		ctx.lineTo(pts[pts.length - 1]![0], GRAPH_BOTTOM);
		ctx.lineTo(pts[0]![0], GRAPH_BOTTOM);
		ctx.closePath();
		ctx.fillStyle = fill;
		ctx.fill();

		ctx.beginPath();
		appendSpline(ctx, pts);
		ctx.strokeStyle = lineColor;
		ctx.lineWidth = 1.5;
		ctx.lineJoin = "round";
		ctx.stroke();
	}

	ctx.font = "10px system-ui, sans-serif";
	ctx.fillStyle = MUTED_COLOR;
	ctx.textAlign = "left";
	ctx.fillText(
		`${spec.format(stats.min)} / ${spec.format(stats.avg)} / ${spec.format(stats.max)}`,
		PAD,
		FOOTER_BASELINE,
	);
};
