import Button from "../button";
import Tooltip, { TooltipProvider } from "../tooltip";
import type { ViewId } from "./layout";
import styles from "./view-bar.module.scss";
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
 * opens (or focuses, if already open) its singleton view; the currently focused
 * view's button is filled.
 */
const ViewBar = ({
	onOpen,
	focusedKind,
}: Readonly<{
	onOpen: (id: ViewId) => void;
	focusedKind: ViewKind | null;
}>) => (
	<div className={styles.bar}>
		<TooltipProvider>
			{VIEWS.map((kind) => {
				const id = makeViewId(kind);
				const Icon = viewIcon(id);
				return (
					<Tooltip key={kind} label={viewTitle(id)} side="right">
						<Button variant="icon" onClick={() => onOpen(id)}>
							<Icon
								weight={focusedKind === kind ? "fill" : undefined}
							/>
						</Button>
					</Tooltip>
				);
			})}
		</TooltipProvider>
	</div>
);

export default ViewBar;
