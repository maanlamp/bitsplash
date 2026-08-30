import { useEffect, useRef, useState } from "react";
import styles from "../timeline/timeline.module.scss";
import { useTimelineView } from "../timeline/timeline-context";
import type { AudioClip } from "./audio-clip";
import type { AudioDocument } from "./audio-document";

const BAR_PITCH = 3;
const BAR_WIDTH = 2;

const ClipWaveform = ({
	doc,
	clip,
	color,
}: Readonly<{
	doc: AudioDocument;
	clip: AudioClip;
	color: string;
}>) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const view = useTimelineView();

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}
		const observer = new ResizeObserver(() => {
			setSize({
				width: canvas.clientWidth,
				height: canvas.clientHeight,
			});
		});
		observer.observe(canvas);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		const { width, height } = size;
		if (!canvas || width <= 0 || height <= 0) {
			return;
		}
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			return;
		}
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = `color-mix(in oklch, ${color}, black 35%)`;

		const peaks = doc.clipPeaks(clip);
		const mid = height / 2;
		if (peaks.length === 0) {
			ctx.fillRect(0, mid - 0.5, width, 1);
			return;
		}
		for (let x = 0; x + BAR_WIDTH <= width; x += BAR_PITCH) {
			const from = Math.floor((x / width) * peaks.length);
			const to = Math.max(
				from + 1,
				Math.ceil(((x + BAR_PITCH) / width) * peaks.length),
			);
			let amp = 0;
			for (let i = from; i < Math.min(peaks.length, to); i++) {
				const peak = peaks[i]!;
				amp = Math.max(amp, Math.abs(peak.min), Math.abs(peak.max));
			}
			const barHeight = Math.max(1, amp * height);
			ctx.fillRect(x, mid - barHeight / 2, BAR_WIDTH, barHeight);
		}
	}, [doc, doc.version, clip, color, size, view.pxPerUnit]);

	return (
		<canvas ref={canvasRef} className={styles.clipWaveformCanvas} />
	);
};

export default ClipWaveform;
