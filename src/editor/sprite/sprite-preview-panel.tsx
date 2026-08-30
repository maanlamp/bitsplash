import { PauseIcon } from "@phosphor-icons/react/dist/icons/Pause";
import { PlayIcon } from "@phosphor-icons/react/dist/icons/Play";
import { useEffect, useRef, useState } from "react";
import Button from "../button";
import Tooltip from "../tooltip";
import type { PixelBuffer } from "./pixel-buffer";
import {
	type PlaybackState,
	activePreviewRange,
	advancePreview,
} from "./preview-playback";
import type { SpriteDocument } from "./sprite-document";
import styles from "./sprite-preview.module.scss";

const START: PlaybackState = {
	frame: 0,
	elapsed: 0,
	finished: false,
};

/**
 * A compact panel that plays the document's **active tag** (the tag containing
 * the editing cursor, or the whole document when none applies) at 1× zoom,
 * honouring per-frame durations and the tag's loop flag. It advances its **own**
 * playback cursor — never the editor's active frame — and recomposites frames
 * live from the document, so edits appear immediately.
 *
 * The overlay placement/size are conventional UX defaults (see the step-17
 * report), not settings.
 */
const SpritePreviewPanel = ({
	doc,
}: Readonly<{ doc: SpriteDocument }>) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [playing, setPlaying] = useState(true);
	const playingRef = useRef(playing);
	useEffect(() => {
		playingRef.current = playing;
	});

	const [label, setLabel] = useState<string>("");

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d") ?? null;
		if (!canvas || !ctx) {
			return;
		}
		ctx.imageSmoothingEnabled = false;

		const frames = new Map<number, PixelBuffer>();
		let cacheVersion = -1;
		const frameImage = (frame: number): PixelBuffer => {
			if (doc.version !== cacheVersion) {
				frames.clear();
				cacheVersion = doc.version;
			}
			let image = frames.get(frame);
			if (!image) {
				image = doc.frameImage(frame);
				frames.set(frame, image);
			}
			return image;
		};

		let playback = START;
		let rangeKey = "";
		let last = performance.now();
		let currentLabel = "";
		let raf = 0;

		const tick = (now: number) => {
			const dt = now - last;
			last = now;

			const range = activePreviewRange(
				doc.activeFrameIndex,
				doc.tags,
				doc.frames.length,
			);
			const key = `${range.from}:${range.to}:${range.loop}`;
			if (key !== rangeKey) {
				rangeKey = key;
				playback = { frame: range.from, elapsed: 0, finished: false };
			}
			const nextLabel = range.name ?? "All frames";
			if (nextLabel !== currentLabel) {
				currentLabel = nextLabel;
				setLabel(nextLabel);
			}

			if (playingRef.current) {
				playback = advancePreview(
					playback,
					dt,
					doc.frames.map((f) => f.duration),
					range,
				);
			}

			const w = doc.width;
			const h = doc.height;
			if (canvas.width !== w || canvas.height !== h) {
				canvas.width = w;
				canvas.height = h;
				ctx.imageSmoothingEnabled = false;
			}
			const image = frameImage(playback.frame);
			const data = ctx.createImageData(w, h);
			data.data.set(image.data);
			ctx.putImageData(data, 0, 0);

			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [doc]);

	return (
		<div className={styles.preview}>
			<div className={styles.header}>
				<Tooltip label={playing ? "Pause preview" : "Play preview"}>
					<Button
						variant="icon"
						onClick={() => setPlaying((p) => !p)}
						aria-label={playing ? "Pause preview" : "Play preview"}
					>
						{playing ? <PauseIcon /> : <PlayIcon />}
					</Button>
				</Tooltip>
				<span className={styles.tag}>{label}</span>
			</div>
			<div className={styles.stage}>
				<canvas ref={canvasRef} className={styles.canvas} />
			</div>
		</div>
	);
};

export default SpritePreviewPanel;
