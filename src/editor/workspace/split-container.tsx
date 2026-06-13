import classNames from "classnames";
import { Children, Fragment, type ReactNode, useRef } from "react";
import type { SplitDirection } from "./layout";
import Splitter from "./splitter";
import styles from "./workspace.module.scss";

const SplitContainer = ({
	direction,
	sizes,
	onResize,
	children,
}: Readonly<{
	direction: SplitDirection;
	sizes: ReadonlyArray<number>;
	onResize: (dividerIndex: number, deltaFraction: number) => void;
	children: ReactNode;
}>) => {
	const ref = useRef<HTMLDivElement>(null);
	const items = Children.toArray(children);

	const onDivider = (dividerIndex: number, pixelDelta: number) => {
		const element = ref.current;
		if (!element) {
			return;
		}
		const size =
			direction === "row"
				? element.clientWidth
				: element.clientHeight;
		if (size > 0) {
			onResize(dividerIndex, pixelDelta / size);
		}
	};

	return (
		<div
			ref={ref}
			className={classNames(
				styles.split,
				direction === "row" ? styles.row : styles.column,
			)}
		>
			{items.map((child, i) => (
				<Fragment key={i}>
					{i > 0 && (
						<Splitter
							direction={direction}
							onResize={(delta) => onDivider(i - 1, delta)}
						/>
					)}
					<div
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
