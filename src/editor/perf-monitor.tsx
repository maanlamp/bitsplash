import { useEffect, useRef } from "react";
import type FantasyPlatformer from "../game/fantasy-platformer";
import styles from "./perf-monitor.module.scss";

const WINDOW = 120;
const CSS_WIDTH = 168;
const CSS_HEIGHT = 76;
const PAD = 6;
const GRAPH_TOP = 18;
const GRAPH_BOTTOM = 56;
const TARGET_MS = 1000 / 60;

const TEXT_COLOR = "#cfd8dc";
const ACCENT_COLOR = "#7fe0a8";
const SPIKE_COLOR = "#e0795f";
const REFERENCE_COLOR = "rgba(255, 255, 255, 0.18)";

const PerfMonitor = ({ game }: { game: FantasyPlatformer }) => {
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
		let head = 0;
		let count = 0;
		let raf = 0;

		const draw = () => {
			const frameTime = game.frameTime;
			const fps = game.fps;

			samples[head] = frameTime;
			head = (head + 1) % WINDOW;
			if (count < WINDOW) {
				count++;
			}

			let min = Infinity;
			let max = 0;
			let sum = 0;
			for (let i = 0; i < count; i++) {
				const v = samples[i]!;
				if (v < min) {
					min = v;
				}
				if (v > max) {
					max = v;
				}
				sum += v;
			}
			const avg = count > 0 ? sum / count : 0;
			if (count === 0) {
				min = 0;
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
			}

			ctx.fillStyle = TEXT_COLOR;
			ctx.fillText(
				`${min.toFixed(1)} / ${avg.toFixed(1)} / ${max.toFixed(1)}`,
				PAD,
				CSS_HEIGHT - PAD,
			);

			raf = requestAnimationFrame(draw);
		};

		raf = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(raf);
	}, [game]);

	return (
		<canvas
			ref={canvasRef}
			className={styles.perfMonitor}
			style={{ width: CSS_WIDTH, height: CSS_HEIGHT }}
		/>
	);
};

export default PerfMonitor;
