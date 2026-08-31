import { IconContext } from "@phosphor-icons/react/dist/lib/context";
import type { ReactNode } from "react";
import type AssetManager from "../../engine/assets";
import styles from "../app.module.scss";
import { AssetManagerProvider } from "../asset-manager-context";
import type { PlaytestPhase } from "../playtest-state";
import TitleBar from "../title-bar";
import { Toaster } from "../toaster";
import { ZoomToastListener } from "../use-zoom-toast";
import {
	allViewIds,
	type ViewId,
	type WindowLayout,
} from "../workspace/layout";
import type { ViewBarState } from "../workspace/view-bar-state";
import type { ViewKind } from "../workspace/view-registry";
import ViewBar from "../workspace/view-bar";
import Workspace from "../workspace/workspace";
import { WindowProvider } from "./window-context";

/** Friendly placeholder shown when a window (only the hub) has no open views. */
const EmptyWorkspace = () => (
	<div className={styles.placeholder}>
		No views open. Pick one from the rail on the left, or open a scene
		or asset.
	</div>
);

/**
 * The full chrome of a single editor window — title-bar drag region, view rail,
 * and the window's own layout tree — wrapped in the per-window realm context and
 * the shared providers. Every window wears this identical shell; the hub renders
 * it into the main document and each satellite renders it into its own React
 * root against the child document. The hub is exempt from empty-auto-close, so an
 * empty layout renders {@link EmptyWorkspace} rather than a blank.
 */
const WindowShell = ({
	windowId,
	doc,
	win,
	assetManager,
	windowLayout,
	onChange,
	renderView,
	onOpenView,
	onCloseView,
	onMoveToNewWindow,
	dirtyViews,
	isTilesetView,
	viewBarState,
	onPlaytest,
	playtestPhase,
	windowFocused,
	showTitleBar,
	onSplitDragStart,
	onSplitDragEnd,
	children,
}: Readonly<{
	windowId: WindowLayout["id"];
	doc: Document;
	win: Window;
	assetManager: AssetManager | null;
	windowLayout: WindowLayout;
	onChange: (
		window: WindowLayout | ((prev: WindowLayout) => WindowLayout),
	) => void;
	renderView: (id: ViewId) => ReactNode;
	onOpenView: (id: ViewId) => void;
	onCloseView: (id: ViewId) => void;
	onMoveToNewWindow: (id: ViewId) => void;
	dirtyViews: ReadonlySet<ViewId>;
	isTilesetView: (id: ViewId) => boolean;
	viewBarState: (kind: ViewKind) => ViewBarState;
	onPlaytest: () => void;
	playtestPhase: PlaytestPhase;
	windowFocused: boolean;
	showTitleBar: boolean;
	onSplitDragStart?: () => void;
	onSplitDragEnd?: () => void;
	children?: ReactNode;
}>) => {
	const empty = allViewIds(windowLayout.root).length === 0;
	return (
		<WindowProvider windowId={windowId} doc={doc} win={win}>
			<IconContext
				value={{ color: "currentColor", size: "1em", weight: "bold" }}
			>
				<AssetManagerProvider value={assetManager}>
					<div className={styles.shell}>
						{showTitleBar && (
							<TitleBar
								onPlaytest={onPlaytest}
								playtestPhase={playtestPhase}
							/>
						)}
						<div className={styles.appBody}>
							<ViewBar onOpen={onOpenView} stateOf={viewBarState} />
							<div className={styles.workspaceArea}>
								{empty ? (
									<EmptyWorkspace />
								) : (
									<Workspace
										windowLayout={windowLayout}
										onChange={onChange}
										renderView={renderView}
										onCloseView={onCloseView}
										onMoveToNewWindow={onMoveToNewWindow}
										dirtyViews={dirtyViews}
										isTilesetView={isTilesetView}
										windowFocused={windowFocused}
										onSplitDragStart={onSplitDragStart}
										onSplitDragEnd={onSplitDragEnd}
									/>
								)}
							</div>
						</div>
					</div>
					{children}
					<Toaster windowId={windowId} />
					<ZoomToastListener />
				</AssetManagerProvider>
			</IconContext>
		</WindowProvider>
	);
};

export default WindowShell;
