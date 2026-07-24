import clsx from "clsx";
import { Children, Fragment, type ReactNode, useRef } from "react";
import { adjustSizes, type SplitDirection } from "./layout";
import Splitter from "./splitter";
import styles from "./workspace.module.scss";

const SplitContainer = ({
	direction,
	sizes,
	onResize,
	onDragStart,
	onDragEnd,
	children,
}: Readonly<{
	direction: SplitDirection;
	sizes: ReadonlyArray<number>;
	onResize: (dividerIndex: number, deltaFraction: number) => void;
	onDragStart?: () => void;
	onDragEnd?: () => void;
	children: ReactNode;
}>) => {
	const ref = useRef<HTMLDivElement>(null);
	const cellRefs = useRef<Array<HTMLDivElement | null>>([]);
	const containerSize = useRef(0);
	const liveSizes = useRef<ReadonlyArray<number>>(sizes);
	const activeDivider = useRef<number | null>(null);
	const items = Children.toArray(children);

	const onDragBegin = (dividerIndex: number) => {
		const element = ref.current;
		if (!element) {
			return;
		}
		containerSize.current =
			direction === "row"
				? element.clientWidth
				: element.clientHeight;
		liveSizes.current = sizes;
		activeDivider.current = dividerIndex;
		onDragStart?.();
	};

	const onDivider = (dividerIndex: number, pixelDelta: number) => {
		if (
			activeDivider.current === null ||
			containerSize.current <= 0
		) {
			return;
		}
		const fraction = pixelDelta / containerSize.current;
		const next = adjustSizes(
			liveSizes.current,
			dividerIndex,
			fraction,
		);
		liveSizes.current = next;
		cellRefs.current[dividerIndex]?.style.setProperty(
			"--flex",
			String(next[dividerIndex] ?? 1),
		);
		cellRefs.current[dividerIndex + 1]?.style.setProperty(
			"--flex",
			String(next[dividerIndex + 1] ?? 1),
		);
	};

	const onDragFinish = () => {
		const dividerIndex = activeDivider.current;
		if (dividerIndex === null) {
			return;
		}
		activeDivider.current = null;
		onResize(
			dividerIndex,
			(liveSizes.current[dividerIndex] ?? 0) -
				(sizes[dividerIndex] ?? 0),
		);
		onDragEnd?.();
	};

	const onDragCancel = () => {
		const dividerIndex = activeDivider.current;
		if (dividerIndex === null) {
			return;
		}
		activeDivider.current = null;
		liveSizes.current = sizes;
		cellRefs.current[dividerIndex]?.style.setProperty(
			"--flex",
			String(sizes[dividerIndex] ?? 1),
		);
		cellRefs.current[dividerIndex + 1]?.style.setProperty(
			"--flex",
			String(sizes[dividerIndex + 1] ?? 1),
		);
		onDragEnd?.();
	};

	return (
		<div
			ref={ref}
			className={clsx(
				styles.split,
				direction === "row" ? styles.row : styles.column,
			)}
		>
			{items.map((child, i) => (
				<Fragment key={i}>
					{i > 0 && (
						<Splitter
							direction={direction}
							onResizeStart={() => onDragBegin(i - 1)}
							onResize={(delta) => onDivider(i - 1, delta)}
							onResizeEnd={onDragFinish}
							onResizeCancel={onDragCancel}
						/>
					)}
					<div
						ref={(el) => {
							cellRefs.current[i] = el;
						}}
						className={styles.cell}
						style={{ "--flex": sizes[i] ?? 1 } as React.CSSProperties}
					>
						{child}
					</div>
				</Fragment>
			))}
		</div>
	);
};

export default SplitContainer;
