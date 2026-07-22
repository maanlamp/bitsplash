import { SpinnerGapIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import styles from "./loading.module.scss";

const Loading = ({
	label = "Loading\u2026",
	className,
}: Readonly<{ label?: string; className?: string }>) => (
	<div className={clsx(styles.root, className)}>
		<SpinnerGapIcon
			className={styles.spinner}
			size={32}
			weight="bold"
		/>
		<span className={styles.label}>{label}</span>
	</div>
);

export default Loading;
