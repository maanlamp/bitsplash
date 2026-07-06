import classNames from "classnames";
import type { ReactNode } from "react";
import styles from "./floating-toolbar.module.scss";
import { TooltipProvider } from "./tooltip";

const FloatingToolbar = ({
	children,
	align = "bottom",
}: Readonly<{ children: ReactNode; align?: "top" | "bottom" }>) => (
	<div
		className={classNames(styles.dock, align === "top" && styles.top)}
		onMouseDown={(e) => e.stopPropagation()}
		onContextMenu={(e) => {
			e.preventDefault();
			e.stopPropagation();
		}}
	>
		<TooltipProvider>
			<div className={styles.bar}>{children}</div>
		</TooltipProvider>
	</div>
);

export default FloatingToolbar;
