import { useEffect, useRef } from "react";
import type { PixelBuffer } from "./pixel-buffer";
import styles from "./timeline.module.scss";

/**
 * A shared, full-resolution scratch canvas: a {@link PixelBuffer} is written
 * with `putImageData` (which ignores scaling) then `drawImage`d — nearest
 * neighbour — into the thumbnail. One module-level scratch is safe because every
 * paint is synchronous.
 */
let scratch: HTMLCanvasElement | null = null;

const scratchOf = (
	width: number,
	height: number,
): CanvasRenderingContext2D => {
	if (!scratch) {
		scratch = document.createElement("canvas");
	}
	if (scratch.width !== width || scratch.height !== height) {
		scratch.width = width;
		scratch.height = height;
	}
	return scratch.getContext("2d", { willReadFrequently: true })!;
};

/**
 * A fixed-size preview of a single cel's pixels for a timeline grid cell. Draws
 * the {@link PixelBuffer} centred and scaled-to-fit with nearest-neighbour
 * sampling; an absent cel (`source === null`) renders empty (the checkerboard
 * shows through). Repaints whenever `source`, dimensions, or `version` change.
 */
const CelThumbnail = ({
	source,
	width,
	height,
	size,
	version,
}: Readonly<{
	source: PixelBuffer | null;
	width: number;
	height: number;
	size: number;
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
		ctx.clearRect(0, 0, size, size);
		if (!source) {
			return;
		}
		const sctx = scratchOf(width, height);
		const image = sctx.createImageData(width, height);
		image.data.set(source.data);
		sctx.putImageData(image, 0, 0);
		const scale = Math.min(size / width, size / height);
		const w = Math.max(1, Math.round(width * scale));
		const h = Math.max(1, Math.round(height * scale));
		ctx.drawImage(
			sctx.canvas,
			Math.floor((size - w) / 2),
			Math.floor((size - h) / 2),
			w,
			h,
		);
	}, [source, width, height, size, version]);

	return (
		<canvas
			ref={ref}
			width={size}
			height={size}
			className={styles.celCanvas}
		/>
	);
};

export default CelThumbnail;
