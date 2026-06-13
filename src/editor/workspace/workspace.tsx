import type { CSSProperties, ReactNode } from "react";
import {
	type LayoutNode,
	resizeSplit,
	type ViewId,
	type Workspace as WorkspaceState,
} from "./layout";
import SplitContainer from "./split-container";
import TabsView, { type TabApi, useTabDocking } from "./tabs";
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
	api,
}: Readonly<{
	node: LayoutNode;
	path: ReadonlyArray<number>;
	renderView: (id: ViewId) => ReactNode;
	onResize: ResizeHandler;
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
		>
			{node.children.map((child, i) => (
				<Node
					key={i}
					node={child}
					path={[...path, i]}
					renderView={renderView}
					onResize={onResize}
					api={api}
				/>
			))}
		</SplitContainer>
	);
};

const Workspace = ({
	workspace,
	onChange,
	renderView,
	onCloseView,
	dirtyViews,
}: Readonly<{
	workspace: WorkspaceState;
	onChange: (workspace: WorkspaceState) => void;
	renderView: (id: ViewId) => ReactNode;
	onCloseView: (id: ViewId) => void;
	dirtyViews: ReadonlySet<ViewId>;
}>) => {
	const { dragging, drop, activate, dragProps } = useTabDocking(
		workspace,
		onChange,
	);

	const onResize: ResizeHandler = (path, dividerIndex, delta) =>
		onChange({
			...workspace,
			root: resizeSplit(workspace.root, path, dividerIndex, delta),
		});

	const api: TabApi = {
		activate,
		close: onCloseView,
		dragging,
		focused: workspace.focused,
		isDirty: (id) => dirtyViews.has(id),
		dragProps,
	};

	return (
		<div className={styles.workspace}>
			<div className={styles.rootCell}>
				<Node
					node={workspace.root}
					path={[]}
					renderView={renderView}
					onResize={onResize}
					api={api}
				/>
			</div>
			{drop && (
				<div
					className={styles.dropOverlay}
					style={
						{
							"--left": `${drop.rect.left}px`,
							"--top": `${drop.rect.top}px`,
							"--width": `${drop.rect.width}px`,
							"--height": `${drop.rect.height}px`,
						} as CSSProperties
					}
				/>
			)}
		</div>
	);
};

export default Workspace;
