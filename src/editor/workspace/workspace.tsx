import type { ReactNode } from "react";
import {
	type LayoutNode,
	resizeSplit,
	setActive,
	type ViewId,
	type WindowLayout,
} from "./layout";
import SplitContainer from "./split-container";
import TabsView, { type TabApi } from "./tabs";
import styles from "./workspace.module.scss";

type ResizeHandler = (
	path: ReadonlyArray<number>,
	dividerIndex: number,
	delta: number,
) => void;

const Node = ({
	node,
	path,
	renderView,
	onResize,
	onDragStart,
	onDragEnd,
	api,
}: Readonly<{
	node: LayoutNode;
	path: ReadonlyArray<number>;
	renderView: (id: ViewId) => ReactNode;
	onResize: ResizeHandler;
	onDragStart?: () => void;
	onDragEnd?: () => void;
	api: TabApi;
}>) => {
	if (node.type === "tabs") {
		return <TabsView node={node} renderView={renderView} api={api} />;
	}
	return (
		<SplitContainer
			direction={node.direction}
			sizes={node.sizes}
			onResize={(dividerIndex, delta) =>
				onResize(path, dividerIndex, delta)
			}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
		>
			{node.children.map((child, i) => (
				<Node
					key={i}
					node={child}
					path={[...path, i]}
					renderView={renderView}
					onResize={onResize}
					onDragStart={onDragStart}
					onDragEnd={onDragEnd}
					api={api}
				/>
			))}
		</SplitContainer>
	);
};

/**
 * One window's layout tree. Tab drags are owned by the app-global
 * {@link import("./tab-drag-controller").TabDragController} (reached by tabs
 * through context), which paints its ghost and drop indicator imperatively into
 * whichever window the cursor is over — so no per-window drop overlay renders
 * here. Tab activation and split resizing remain local window mutations.
 */
const Workspace = ({
	windowLayout,
	onChange,
	renderView,
	onCloseView,
	onMoveToNewWindow,
	dirtyViews,
	isTilesetView,
	windowFocused,
	onSplitDragStart,
	onSplitDragEnd,
}: Readonly<{
	windowLayout: WindowLayout;
	onChange: (
		window: WindowLayout | ((prev: WindowLayout) => WindowLayout),
	) => void;
	renderView: (id: ViewId) => ReactNode;
	onCloseView: (id: ViewId) => void;
	onMoveToNewWindow: (id: ViewId) => void;
	dirtyViews: ReadonlySet<ViewId>;
	isTilesetView: (id: ViewId) => boolean;
	windowFocused: boolean;
	onSplitDragStart?: () => void;
	onSplitDragEnd?: () => void;
}>) => {
	const activate = (id: ViewId): void => {
		if (windowLayout.focused === id) {
			return;
		}
		onChange((prev) => ({
			...prev,
			root: setActive(prev.root, id),
			focused: id,
		}));
	};

	const onResize: ResizeHandler = (path, dividerIndex, delta) =>
		onChange((prev) => ({
			...prev,
			root: resizeSplit(prev.root, path, dividerIndex, delta),
		}));

	const api: TabApi = {
		windowId: windowLayout.id,
		activate,
		close: onCloseView,
		moveToNewWindow: onMoveToNewWindow,
		focused: windowLayout.focused,
		windowFocused,
		isDirty: (id) => dirtyViews.has(id),
		isTileset: isTilesetView,
	};

	return (
		<div className={styles.workspace}>
			<div className={styles.rootCell}>
				<Node
					node={windowLayout.root}
					path={[]}
					renderView={renderView}
					onResize={onResize}
					onDragStart={onSplitDragStart}
					onDragEnd={onSplitDragEnd}
					api={api}
				/>
			</div>
		</div>
	);
};

export default Workspace;
