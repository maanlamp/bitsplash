import { useEffect, useRef } from "react";
import styles from "./color-picker.module.scss";
import { chromaInGamut, oklchToRgb255 } from "./oklch";

const SIZE = 232;
export const CHROMA_MAX = 0.4;

const ColorSquare = ({
	l,
	c,
	h,
	onPick,
}: Readonly<{
	l: number;
	c: number;
	h: number;
	onPick: (l: number, c: number) => void;
}>) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const dragging = useRef(false);
	const rowMax = chromaInGamut(l, CHROMA_MAX, h);

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!ctx) {
			return;
		}
		const frame = requestAnimationFrame(() => {
			const img = ctx.createImageData(SIZE, SIZE);
			const data = img.data;
			for (let y = 0; y < SIZE; y++) {
				const lightness = 1 - y / (SIZE - 1);
				const rowMax = chromaInGamut(lightness, CHROMA_MAX, h);
				for (let x = 0; x < SIZE; x++) {
					const chroma = (x / (SIZE - 1)) * rowMax;
					const [r, g, b] = oklchToRgb255(lightness, chroma, h);
					const i = (y * SIZE + x) * 4;
					data[i] = r;
					data[i + 1] = g;
					data[i + 2] = b;
					data[i + 3] = 255;
				}
			}
			ctx.putImageData(img, 0, 0);
		});
		return () => cancelAnimationFrame(frame);
	}, [h]);

	const setFrom = (clientX: number, clientY: number) => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}
		const rect = canvas.getBoundingClientRect();
		const px = Math.max(
			0,
			Math.min(1, (clientX - rect.left) / rect.width),
		);
		const py = Math.max(
			0,
			Math.min(1, (clientY - rect.top) / rect.height),
		);
		const lightness = 1 - py;
		onPick(lightness, px * chromaInGamut(lightness, CHROMA_MAX, h));
	};

	return (
		<div className={styles.colorSquare}>
			<canvas
				ref={canvasRef}
				width={SIZE}
				height={SIZE}
				className={styles.colorSquareCanvas}
				onPointerDown={(e) => {
					dragging.current = true;
					e.currentTarget.setPointerCapture(e.pointerId);
					setFrom(e.clientX, e.clientY);
				}}
				onPointerMove={(e) => {
					if (dragging.current) {
						setFrom(e.clientX, e.clientY);
					}
				}}
				onPointerUp={(e) => {
					dragging.current = false;
					e.currentTarget.releasePointerCapture(e.pointerId);
				}}
			/>
			<div
				className={styles.spriteRingThumb}
				style={{
					left: `${rowMax > 0 ? (c / rowMax) * 100 : 0}%`,
					top: `${(1 - l) * 100}%`,
				}}
			/>
		</div>
	);
};

export default ColorSquare;
