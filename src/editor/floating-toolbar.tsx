import type { ReactNode } from "react";
import styles from "./floating-toolbar.module.scss";
import { TooltipProvider } from "./tooltip";

const FloatingToolbar = ({
	children,
}: Readonly<{ children: ReactNode }>) => (
	<div
		className={styles.dock}
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
