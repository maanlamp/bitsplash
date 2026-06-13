import classNames from "classnames";
import { useRef } from "react";
import type { SplitDirection } from "./layout";
import styles from "./workspace.module.scss";

const Splitter = ({
	direction,
	onResize,
}: Readonly<{
	direction: SplitDirection;
	onResize: (pixelDelta: number) => void;
}>) => {
	const last = useRef(0);

	const onPointerDown = (
		event: React.PointerEvent<HTMLDivElement>,
	) => {
		event.preventDefault();
		last.current =
			direction === "row" ? event.clientX : event.clientY;
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const onPointerMove = (
		event: React.PointerEvent<HTMLDivElement>,
	) => {
		if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
			return;
		}
		const position =
			direction === "row" ? event.clientX : event.clientY;
		onResize(position - last.current);
		last.current = position;
	};

	const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	return (
		<div
			className={classNames(
				styles.splitter,
				direction === "row"
					? styles.splitterRow
					: styles.splitterColumn,
			)}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			role="separator"
			aria-orientation={
				direction === "row" ? "vertical" : "horizontal"
			}
		>
			<div className={styles.thumb} />
		</div>
	);
};

export default Splitter;
