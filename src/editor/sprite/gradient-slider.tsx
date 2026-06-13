import classNames from "classnames";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import styles from "./color-picker.module.scss";

const GradientSlider = ({
	value,
	onChange,
	onCommit,
	background,
	display,
}: Readonly<{
	value: number;
	onChange: (value: number) => void;
	onCommit?: () => void;
	background: string;
	display?: ReactNode;
}>) => {
	const trackRef = useRef<HTMLDivElement>(null);
	const dragging = useRef(false);
	const [active, setActive] = useState(false);

	const setFrom = (clientX: number) => {
		const el = trackRef.current;
		if (!el) {
			return;
		}
		const rect = el.getBoundingClientRect();
		onChange(
			Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
		);
	};

	return (
		<div
			ref={trackRef}
			className={styles.sliderTrack}
			style={{ background }}
			onPointerDown={(e) => {
				dragging.current = true;
				setActive(true);
				e.currentTarget.setPointerCapture(e.pointerId);
				setFrom(e.clientX);
			}}
			onPointerMove={(e) => {
				if (dragging.current) {
					setFrom(e.clientX);
				}
			}}
			onPointerUp={(e) => {
				if (dragging.current) {
					dragging.current = false;
					setActive(false);
					e.currentTarget.releasePointerCapture(e.pointerId);
					onCommit?.();
				}
			}}
		>
			<div
				className={styles.sliderThumb}
				style={{ left: `${value * 100}%` }}
			/>
			{display !== undefined && (
				<div
					className={classNames(
						styles.sliderBubble,
						active && styles.sliderBubbleActive,
					)}
					style={{ left: `${value * 100}%` }}
				>
					{display}
				</div>
			)}
		</div>
	);
};

export default GradientSlider;
