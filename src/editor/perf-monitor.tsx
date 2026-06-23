import { useEffect, useRef } from "react";
import styles from "./perf-monitor.module.scss";

export type FrameStats = Readonly<{
	frameTime: number;
	fps: number;
	physicsTime: number;
}>;

const WINDOW = 120;
const CSS_WIDTH = 168;
const CSS_HEIGHT = 92;
const PAD = 6;
const GRAPH_TOP = 18;
const GRAPH_BOTTOM = 56;
const TARGET_MS = 1000 / 60;

const TEXT_COLOR = "#cfd8dc";
const ACCENT_COLOR = "#7fe0a8";
const PHYS_COLOR = "#8fb8e0";
const SPIKE_COLOR = "#e0795f";
const REFERENCE_COLOR = "rgba(255, 255, 255, 0.18)";

const PerfMonitor = ({ stats }: { stats: FrameStats }) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			return;
		}

		const dpr = window.devicePixelRatio;
		canvas.width = Math.round(CSS_WIDTH * dpr);
		canvas.height = Math.round(CSS_HEIGHT * dpr);
		ctx.scale(dpr, dpr);
		ctx.font = "10px monospace";
		ctx.textBaseline = "alphabetic";

		const samples = new Float32Array(WINDOW);
		const physSamples = new Float32Array(WINDOW);
		let head = 0;
		let count = 0;
		let raf = 0;

		const draw = () => {
			const frameTime = stats.frameTime;
			const fps = stats.fps;

			samples[head] = frameTime;
			physSamples[head] = stats.physicsTime;
			head = (head + 1) % WINDOW;
			if (count < WINDOW) {
				count++;
			}

			let min = Infinity;
			let max = 0;
			let sum = 0;
			let pMin = Infinity;
			let pMax = 0;
			let pSum = 0;
			for (let i = 0; i < count; i++) {
				const v = samples[i]!;
				if (v < min) {
					min = v;
				}
				if (v > max) {
					max = v;
				}
				sum += v;
				const p = physSamples[i]!;
				if (p < pMin) {
					pMin = p;
				}
				if (p > pMax) {
					pMax = p;
				}
				pSum += p;
			}
			const avg = count > 0 ? sum / count : 0;
			const pAvg = count > 0 ? pSum / count : 0;
			if (count === 0) {
				min = 0;
				pMin = 0;
			}

			ctx.clearRect(0, 0, CSS_WIDTH, CSS_HEIGHT);

			ctx.fillStyle = TEXT_COLOR;
			ctx.fillText(
				`${fps.toFixed(0)} FPS  ${frameTime.toFixed(1)}ms`,
				PAD,
				12,
			);

			const graphW = CSS_WIDTH - PAD * 2;
			const graphH = GRAPH_BOTTOM - GRAPH_TOP;
			const scaleMax = Math.max(max * 1.15, TARGET_MS * 1.5);
			const toY = (ms: number) =>
				GRAPH_BOTTOM - (Math.min(ms, scaleMax) / scaleMax) * graphH;

			if (TARGET_MS < scaleMax) {
				const refY = toY(TARGET_MS);
				ctx.strokeStyle = REFERENCE_COLOR;
				ctx.beginPath();
				ctx.moveTo(PAD, refY);
				ctx.lineTo(PAD + graphW, refY);
				ctx.stroke();
			}

			if (count > 1) {
				ctx.beginPath();
				for (let i = 0; i < count; i++) {
					const idx = (head - count + i + WINDOW * 2) % WINDOW;
					const x = PAD + (i / (count - 1)) * graphW;
					const y = toY(samples[idx]!);
					if (i === 0) {
						ctx.moveTo(x, y);
					} else {
						ctx.lineTo(x, y);
					}
				}
				ctx.strokeStyle =
					max > TARGET_MS * 1.5 ? SPIKE_COLOR : ACCENT_COLOR;
				ctx.stroke();

				ctx.beginPath();
				for (let i = 0; i < count; i++) {
					const idx = (head - count + i + WINDOW * 2) % WINDOW;
					const x = PAD + (i / (count - 1)) * graphW;
					const y = toY(physSamples[idx]!);
					if (i === 0) {
						ctx.moveTo(x, y);
					} else {
						ctx.lineTo(x, y);
					}
				}
				ctx.strokeStyle = PHYS_COLOR;
				ctx.stroke();
			}

			ctx.fillStyle = TEXT_COLOR;
			ctx.fillText(
				`frm ${min.toFixed(1)}/${avg.toFixed(1)}/${max.toFixed(1)}`,
				PAD,
				CSS_HEIGHT - PAD - 14,
			);
			ctx.fillStyle = PHYS_COLOR;
			ctx.fillText(
				`phy ${pMin.toFixed(2)}/${pAvg.toFixed(2)}/${pMax.toFixed(2)}`,
				PAD,
				CSS_HEIGHT - PAD,
			);

			raf = requestAnimationFrame(draw);
		};

		raf = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(raf);
	}, [stats]);

	return (
		<canvas
			ref={canvasRef}
			className={styles.perfMonitor}
			style={{ width: CSS_WIDTH, height: CSS_HEIGHT }}
		/>
	);
};

export default PerfMonitor;
