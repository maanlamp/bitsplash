import clsx from "clsx";
import { useEffect, useEffectEvent, useRef } from "react";
import type { SplitDirection } from "./layout";
import styles from "./workspace.module.scss";

const Splitter = ({
	direction,
	onResize,
	onResizeStart,
	onResizeEnd,
	onResizeCancel,
}: Readonly<{
	direction: SplitDirection;
	onResize: (pixelDelta: number) => void;
	onResizeStart?: () => void;
	onResizeEnd?: () => void;
	onResizeCancel?: () => void;
}>) => {
	const last = useRef(0);
	const dragging = useRef(false);
	const pointerId = useRef<number | null>(null);
	const target = useRef<HTMLDivElement | null>(null);
	const keyHandler = useRef<((event: KeyboardEvent) => void) | null>(
		null,
	);

	const detachKey = () => {
		const doc = target.current?.ownerDocument;
		if (doc && keyHandler.current) {
			doc.removeEventListener("keydown", keyHandler.current, true);
		}
		keyHandler.current = null;
	};

	const endDrag = () => {
		if (!dragging.current) {
			return;
		}
		dragging.current = false;
		detachKey();
		onResizeEnd?.();
	};

	const cancelDrag = () => {
		if (!dragging.current) {
			return;
		}
		dragging.current = false;
		detachKey();
		const element = target.current;
		if (
			element &&
			pointerId.current !== null &&
			element.hasPointerCapture(pointerId.current)
		) {
			element.releasePointerCapture(pointerId.current);
		}
		onResizeCancel?.();
	};

	const detachKeyOnUnmount = useEffectEvent((): void => {
		detachKey();
	});
	useEffect(() => () => detachKeyOnUnmount(), []);

	const onPointerDown = (
		event: React.PointerEvent<HTMLDivElement>,
	) => {
		event.preventDefault();
		last.current =
			direction === "row" ? event.clientX : event.clientY;
		event.currentTarget.setPointerCapture(event.pointerId);
		target.current = event.currentTarget;
		pointerId.current = event.pointerId;
		dragging.current = true;
		const handler = (keyEvent: KeyboardEvent) => {
			if (keyEvent.key === "Escape") {
				keyEvent.preventDefault();
				keyEvent.stopPropagation();
				cancelDrag();
			}
		};
		keyHandler.current = handler;
		event.currentTarget.ownerDocument.addEventListener(
			"keydown",
			handler,
			true,
		);
		onResizeStart?.();
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
		endDrag();
	};

	return (
		<div
			className={clsx(
				styles.splitter,
				direction === "row"
					? styles.splitterRow
					: styles.splitterColumn,
			)}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onLostPointerCapture={endDrag}
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
