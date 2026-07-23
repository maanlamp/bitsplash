import clsx from "clsx";
import Button from "../button";
import Tooltip, { TooltipProvider } from "../tooltip";
import type { ViewId } from "./layout";
import styles from "./view-bar.module.scss";
import type { ViewBarState } from "./view-bar-state";
import {
	makeViewId,
	type ViewKind,
	viewIcon,
	viewTitle,
} from "./view-registry";

/**
 * The singleton (non-param) views the rail can open. Scene and asset views are
 * opened by picking a scene/asset elsewhere, so they are not listed here.
 */
const VIEWS: ReadonlyArray<ViewKind> = [
	"tree",
	"inspector",
	"asset-browser",
	"console",
	"profiler",
];

/**
 * Left-edge rail for opening the always-available editor views. Each button
 * summons its singleton view: if open anywhere it activates the existing tab in
 * place (never raising another window); if closed it opens here. The icon
 * reflects the view's {@link ViewBarState} — filled when open in this window,
 * dimmed fill (with an "in another window" tooltip) when open elsewhere, plain
 * when closed.
 *
 * The editor-global playtest action does not live here — it sits in the window
 * titlebar ({@link TitleBar}).
 */
const ViewBar = ({
	onOpen,
	stateOf,
}: Readonly<{
	onOpen: (id: ViewId) => void;
	stateOf: (kind: ViewKind) => ViewBarState;
}>) => (
	<div className={styles.bar}>
		<TooltipProvider>
			{VIEWS.map((kind) => {
				const id = makeViewId(kind);
				const Icon = viewIcon(id);
				const state = stateOf(kind);
				const label =
					state === "elsewhere"
						? `${viewTitle(id)} (in another window)`
						: viewTitle(id);
				return (
					<Tooltip key={kind} label={label} side="right">
						<Button
							variant="icon"
							className={clsx(
								state === "elsewhere" && styles.elsewhere,
							)}
							onClick={() => onOpen(id)}
						>
							<Icon
								weight={state === "closed" ? undefined : "fill"}
							/>
						</Button>
					</Tooltip>
				);
			})}
		</TooltipProvider>
	</div>
);

export default ViewBar;
