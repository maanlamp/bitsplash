import { Toolbar } from "@base-ui/react/toolbar";
import clsx from "clsx";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import controls from "./styles/controls.module.scss";
import Tooltip from "./tooltip";
import styles from "./view-toolbar.module.scss";

/**
 * A docked, shell-agnostic view-toolbar: a horizontal bar of view-level commands
 * that renders at the top of whatever editor view hosts it. Built on the base-ui
 * `Toolbar` (roving-focus, keyboard-navigable) and intentionally free of any
 * per-view logic so every editor surface can reuse it. Compose it from
 * {@link ViewToolbarButton}, {@link ViewToolbarSeparator}, or base-ui
 * `Toolbar.Group`/`Menu` for dropdown groups.
 *
 * Requires a `Tooltip.Provider` ancestor when its buttons carry tooltips.
 *
 * @example
 * ```tsx
 * <ViewToolbar>
 *   <ViewToolbarButton label="Flip horizontal" onClick={flip}>
 *     <FlipHorizontalIcon />
 *   </ViewToolbarButton>
 * </ViewToolbar>
 * ```
 */
const ViewToolbar = ({
	children,
	className,
	...props
}: Readonly<ComponentProps<typeof Toolbar.Root>>) => (
	<Toolbar.Root className={clsx(styles.bar, className)} {...props}>
		{children}
	</Toolbar.Root>
);

export default ViewToolbar;

/**
 * An icon button for a {@link ViewToolbar}. Renders a base-ui `Toolbar.Button`
 * (a composite roving-focus item) styled as the editor's standard icon button,
 * with a tooltip that doubles as the button's accessible name.
 */
export const ViewToolbarButton = ({
	label,
	shortcut,
	disabled,
	onClick,
	children,
}: Readonly<{
	label: string;
	shortcut?: string;
	disabled?: boolean;
	onClick?: () => void;
	children: ReactNode;
}>): ReactElement => (
	<Tooltip label={label} shortcut={shortcut}>
		<Toolbar.Button
			className={controls.iconButton}
			disabled={disabled}
			aria-label={label}
			onClick={onClick}
		>
			{children}
		</Toolbar.Button>
	</Tooltip>
);

/** A vertical divider between groups of {@link ViewToolbar} items. */
export const ViewToolbarSeparator = (): ReactElement => (
	<Toolbar.Separator className={styles.separator} />
);
