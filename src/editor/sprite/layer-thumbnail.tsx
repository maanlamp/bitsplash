import { useEffect, useRef } from "react";
import styles from "./layers-panel.module.scss";

const SIZE = 32;

const LayerThumbnail = ({
	source,
	width,
	height,
	version,
}: Readonly<{
	source: HTMLCanvasElement;
	width: number;
	height: number;
	version: number;
}>) => {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) {
			return;
		}
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			return;
		}
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, SIZE, SIZE);
		const scale = Math.min(SIZE / width, SIZE / height);
		const w = Math.max(1, Math.round(width * scale));
		const h = Math.max(1, Math.round(height * scale));
		ctx.drawImage(
			source,
			Math.floor((SIZE - w) / 2),
			Math.floor((SIZE - h) / 2),
			w,
			h,
		);
	}, [source, width, height, version]);

	return (
		<canvas
			ref={ref}
			width={SIZE}
			height={SIZE}
			className={styles.layerThumb}
		/>
	);
};

export default LayerThumbnail;
