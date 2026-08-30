import { ContextMenu } from "@base-ui/react/context-menu";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/icons/ArrowSquareOut";
import { XIcon } from "@phosphor-icons/react/dist/icons/X";
import type { Icon } from "@phosphor-icons/react/dist/lib/types";
import clsx from "clsx";
import { type ReactNode, useSyncExternalStore } from "react";
import surface from "../styles/surface.module.scss";
import Tooltip from "../tooltip";
import { usePortalContainer } from "../window/portal-container";
import { type TabsNode, type ViewId, type WindowId } from "./layout";
import { useTabDragController } from "./tab-drag-context";
import { viewIcon, viewTitle } from "./view-registry";
import styles from "./workspace.module.scss";

export type TabApi = Readonly<{
	windowId: WindowId;
	activate: (id: ViewId) => void;
	close: (id: ViewId) => void;
	moveToNewWindow: (id: ViewId) => void;
	focused: ViewId | null;
	windowFocused: boolean;
	isDirty: (id: ViewId) => boolean;
	isTileset: (id: ViewId) => boolean;
}>;

const focusTab = (from: HTMLElement, id: ViewId): void => {
	const strip = from.closest("[data-strip]");
	const target = strip?.querySelector<HTMLElement>(
		`[data-tab="${id}"]`,
	);
	target?.focus();
};

/**
 * Subscribe a tab to the drag controller so it re-renders (applying the
 * dragging treatment) when a drag engages or ends. Returns the dragging view id
 * or `null`, read from the controller's live state.
 */
const useDraggingView = (): ViewId | null => {
	const controller = useTabDragController();
	return useSyncExternalStore(
		(listener) => controller?.subscribe(listener) ?? (() => {}),
		() => controller?.draggingView ?? null,
		() => null,
	);
};

const Tab = ({
	id,
	icon: Icon,
	active,
	single,
	views,
	api,
}: Readonly<{
	id: ViewId;
	icon: Icon;
	active: boolean;
	single: boolean;
	views: ReadonlyArray<ViewId>;
	api: TabApi;
}>) => {
	const controller = useTabDragController();
	const dragging = useDraggingView();
	const portalContainer = usePortalContainer();

	const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		const index = views.indexOf(id);
		let next = -1;
		if (event.key === "ArrowRight") {
			next = (index + 1) % views.length;
		} else if (event.key === "ArrowLeft") {
			next = (index - 1 + views.length) % views.length;
		} else if (event.key === "Home") {
			next = 0;
		} else if (event.key === "End") {
			next = views.length - 1;
		}
		const target = views[next];
		if (next >= 0 && target) {
			event.preventDefault();
			api.activate(target);
			focusTab(event.currentTarget, target);
		}
	};

	return (
		<ContextMenu.Root>
			<ContextMenu.Trigger
				render={
					<div
						role="tab"
						aria-selected={active}
						tabIndex={active ? 0 : -1}
						data-tab={id}
						className={clsx(
							styles.tab,
							(active || single) && styles.tabActive,
							single && styles.tabSingle,
							dragging === id && styles.tabDragging,
						)}
						onPointerDown={(event) =>
							controller?.begin(
								id,
								api.windowId,
								event.nativeEvent,
								event.currentTarget,
							)
						}
						onMouseUp={(e) => {
							if (e.button === 1) {
								api.close(id);
							}
						}}
						onKeyDown={onKeyDown}
					>
						<Icon className={styles.tabIcon} />
						<span className={styles.tabTitle}>{viewTitle(id)}</span>
						<Tooltip label="Close">
							<button
								type="button"
								tabIndex={-1}
								className={styles.tabClose}
								data-dirty={api.isDirty(id)}
								onClick={(event) => {
									event.stopPropagation();
									api.close(id);
								}}
								onPointerDown={(event) => event.stopPropagation()}
							>
								<span className={styles.tabDot} />
								<XIcon className={styles.tabX} />
							</button>
						</Tooltip>
					</div>
				}
			/>
			<ContextMenu.Portal container={portalContainer}>
				<ContextMenu.Positioner>
					<ContextMenu.Popup
						className={clsx(surface.surface, surface.menu)}
					>
						<ContextMenu.Item
							className={surface.item}
							onClick={() => api.moveToNewWindow(id)}
						>
							<ArrowSquareOutIcon
								className={surface.itemIcon}
								weight="bold"
							/>
							Move to new window
						</ContextMenu.Item>
					</ContextMenu.Popup>
				</ContextMenu.Positioner>
			</ContextMenu.Portal>
		</ContextMenu.Root>
	);
};

const TabsView = ({
	node,
	renderView,
	api,
}: Readonly<{
	node: TabsNode;
	renderView: (id: ViewId) => ReactNode;
	api: TabApi;
}>) => (
	<div
		className={clsx(
			styles.slot,
			node.active === api.focused && styles.slotFocused,
			!api.windowFocused && styles.windowUnfocused,
		)}
		data-leaf={node.active}
	>
		<div className={styles.strip} data-strip role="tablist">
			{node.views.map((view) => (
				<Tab
					key={view}
					id={view}
					icon={viewIcon(view, api.isTileset(view))}
					active={view === node.active}
					single={node.views.length === 1}
					views={node.views}
					api={api}
				/>
			))}
		</div>
		<div className={styles.tabContent}>
			{node.views.map((view) => (
				<div
					key={view}
					role="tabpanel"
					className={clsx(
						styles.content,
						view !== node.active && styles.hidden,
					)}
					onPointerDownCapture={() => api.activate(view)}
				>
					{renderView(view)}
				</div>
			))}
		</div>
	</div>
);

export default TabsView;
