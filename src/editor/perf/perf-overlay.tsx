import { useEffect, useRef } from "react";
import type { SceneView } from "../scene-view";
import styles from "./perf-overlay.module.scss";
import {
	drawPerfWidget,
	TARGET_MS,
	WIDGET_HEIGHT,
	WIDGET_WIDTH,
	type WidgetSpec,
} from "./perf-widget";

const MB = 1024 * 1024;

/**
 * The three scene-view metrics. FPS graphs **frametime** (the continuous
 * headroom signal) with the current fps as its headline; Update is the
 * `ecs.update()` span (physics included); Memory is the whole-process JS heap.
 */
const SPECS: ReadonlyArray<WidgetSpec> = [
	{
		name: "FPS",
		series: "frametime",
		color: "#5ee6a8",
		minScale: TARGET_MS * 1.5,
		headline: (history) => `${Math.round(history.fps)} fps`,
		format: (v) => v.toFixed(1),
		spike: (stats) => stats.max > TARGET_MS * 1.5,
	},
	{
		name: "Update",
		series: "update",
		color: "#7aa2f7",
		minScale: TARGET_MS,
		headline: (_history, stats) => `${stats.current.toFixed(2)} ms`,
		format: (v) => v.toFixed(2),
		spike: (stats) => stats.max > TARGET_MS,
	},
	{
		name: "Memory",
		series: "heap",
		color: "#e0b15f",
		minScale: MB,
		headline: (_history, stats) =>
			`${(stats.current / MB).toFixed(0)} MB`,
		format: (v) => `${(v / MB).toFixed(0)}`,
		spike: () => false,
	},
];

/**
 * The scene-view perf strip: three canvas widgets (FPS / Update / Memory) driven
 * by a single rAF that redraws all three from the view's {@link PerfHistory} ring
 * buffers. Drawing is gated on the strip being visible (its `offsetParent` is
 * `null` when the view's tab is hidden), so background views stop redrawing.
 */
const PerfOverlay = ({ view }: Readonly<{ view: SceneView }>) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}
		const dpr = window.devicePixelRatio;
		const contexts = canvasRefs.current.map((canvas) => {
			const ctx = canvas?.getContext("2d");
			if (!canvas || !ctx) {
				return null;
			}
			canvas.width = Math.round(WIDGET_WIDTH * dpr);
			canvas.height = Math.round(WIDGET_HEIGHT * dpr);
			ctx.scale(dpr, dpr);
			return ctx;
		});

		let raf = 0;
		const draw = (): void => {
			if (container.offsetParent !== null) {
				for (let i = 0; i < SPECS.length; i++) {
					const ctx = contexts[i];
					if (ctx) {
						drawPerfWidget(ctx, SPECS[i]!, view.perf);
					}
				}
			}
			raf = requestAnimationFrame(draw);
		};
		raf = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(raf);
	}, [view]);

	return (
		<div ref={containerRef} className={styles.overlay}>
			{SPECS.map((spec, i) => (
				<div key={spec.name} className={styles.widget}>
					<canvas
						ref={(el) => {
							canvasRefs.current[i] = el;
						}}
						className={styles.canvas}
						style={{ width: WIDGET_WIDTH, height: WIDGET_HEIGHT }}
					/>
				</div>
			))}
		</div>
	);
};

export default PerfOverlay;
