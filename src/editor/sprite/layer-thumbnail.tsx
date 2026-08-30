import { useEffect, useRef } from "react";
import type { LayerThumb } from "./sprite-document";
import styles from "./timeline.module.scss";

const SIZE = 32;

const LayerThumbnail = ({
	layer,
}: Readonly<{
	layer: LayerThumb | null;
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
		if (!layer) {
			return;
		}
		const { canvas: source, width, height } = layer;
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
	}, [layer]);

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
