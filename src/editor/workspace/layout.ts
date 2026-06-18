export type ViewId = string;

export type SplitDirection = "row" | "column";

export type DockZone = "center" | "top" | "bottom" | "left" | "right";

export type SplitNode = Readonly<{
	type: "split";
	direction: SplitDirection;
	sizes: ReadonlyArray<number>;
	children: ReadonlyArray<LayoutNode>;
}>;

export type TabsNode = Readonly<{
	type: "tabs";
	views: ReadonlyArray<ViewId>;
	active: ViewId;
}>;

export type LayoutNode = SplitNode | TabsNode;

export type Workspace = Readonly<{
	version: number;
	root: LayoutNode;
	focused: ViewId | null;
}>;

export const WORKSPACE_VERSION = 2;

const MIN_SIZE = 0.08;

const renormalize = (
	sizes: ReadonlyArray<number>,
): ReadonlyArray<number> => {
	const total = sizes.reduce((sum, value) => sum + value, 0);
	if (total <= 0) {
		return sizes.map(() => 1 / sizes.length);
	}
	return sizes.map((value) => value / total);
};

const samePath = (
	a: ReadonlyArray<number>,
	b: ReadonlyArray<number>,
): boolean =>
	a.length === b.length && a.every((value, i) => value === b[i]);

export const adjustSizes = (
	sizes: ReadonlyArray<number>,
	dividerIndex: number,
	delta: number,
): ReadonlyArray<number> => {
	const before = sizes[dividerIndex];
	const after = sizes[dividerIndex + 1];
	if (before === undefined || after === undefined) {
		return sizes;
	}
	const clamped = Math.max(
		-(before - MIN_SIZE),
		Math.min(after - MIN_SIZE, delta),
	);
	return sizes.map((size, i) => {
		if (i === dividerIndex) {
			return size + clamped;
		}
		if (i === dividerIndex + 1) {
			return size - clamped;
		}
		return size;
	});
};

export const getNode = (
	root: LayoutNode,
	path: ReadonlyArray<number>,
): LayoutNode => {
	let node = root;
	for (const index of path) {
		if (node.type !== "split") {
			throw new Error("Invalid layout path: expected a split node.");
		}
		const child = node.children[index];
		if (!child) {
			throw new Error(
				"Invalid layout path: child index out of range.",
			);
		}
		node = child;
	}
	return node;
};

const updateNode = (
	root: LayoutNode,
	path: ReadonlyArray<number>,
	update: (node: LayoutNode) => LayoutNode,
): LayoutNode => {
	if (path.length === 0) {
		return update(root);
	}
	if (root.type !== "split") {
		throw new Error("Invalid layout path: expected a split node.");
	}
	const [head, ...rest] = path;
	return {
		...root,
		children: root.children.map((child, i) =>
			i === head ? updateNode(child, rest, update) : child,
		),
	};
};

export const findView = (
	root: LayoutNode,
	viewId: ViewId,
	path: ReadonlyArray<number> = [],
): ReadonlyArray<number> | null => {
	if (root.type === "tabs") {
		return root.views.includes(viewId) ? path : null;
	}
	for (let i = 0; i < root.children.length; i++) {
		const found = findView(root.children[i]!, viewId, [...path, i]);
		if (found) {
			return found;
		}
	}
	return null;
};

export const allViewIds = (
	root: LayoutNode,
): ReadonlyArray<ViewId> => {
	if (root.type === "tabs") {
		return root.views;
	}
	return root.children.flatMap(allViewIds);
};

const emptyTabs = (): TabsNode => ({
	type: "tabs",
	views: [],
	active: "",
});

const removeFromNode = (
	node: LayoutNode,
	viewId: ViewId,
): LayoutNode | null => {
	if (node.type === "tabs") {
		if (!node.views.includes(viewId)) {
			return node;
		}
		const index = node.views.indexOf(viewId);
		const views = node.views.filter((id) => id !== viewId);
		if (views.length === 0) {
			return null;
		}
		const active =
			node.active === viewId
				? (views[Math.min(index, views.length - 1)] ?? views[0]!)
				: node.active;
		return { type: "tabs", views, active };
	}
	const children: LayoutNode[] = [];
	const sizes: number[] = [];
	node.children.forEach((child, i) => {
		const next = removeFromNode(child, viewId);
		if (next !== null) {
			children.push(next);
			sizes.push(node.sizes[i]!);
		}
	});
	if (children.length === 0) {
		return null;
	}
	if (children.length === 1) {
		return children[0]!;
	}
	return {
		type: "split",
		direction: node.direction,
		sizes: renormalize(sizes),
		children,
	};
};

export const removeView = (
	root: LayoutNode,
	viewId: ViewId,
): LayoutNode => removeFromNode(root, viewId) ?? emptyTabs();

export const setActive = (
	root: LayoutNode,
	viewId: ViewId,
): LayoutNode => {
	const path = findView(root, viewId);
	if (!path) {
		return root;
	}
	return updateNode(root, path, (node) =>
		node.type === "tabs" ? { ...node, active: viewId } : node,
	);
};

export const insertView = (
	root: LayoutNode,
	viewId: ViewId,
	targetPath: ReadonlyArray<number>,
	zone: DockZone,
): LayoutNode =>
	updateNode(root, targetPath, (node) => {
		if (zone === "center") {
			if (node.type !== "tabs") {
				return node;
			}
			if (node.views.includes(viewId)) {
				return { ...node, active: viewId };
			}
			return {
				type: "tabs",
				views: [...node.views, viewId],
				active: viewId,
			};
		}
		const dropped: TabsNode = {
			type: "tabs",
			views: [viewId],
			active: viewId,
		};
		const direction: SplitDirection =
			zone === "left" || zone === "right" ? "row" : "column";
		const before = zone === "left" || zone === "top";
		return {
			type: "split",
			direction,
			sizes: [0.5, 0.5],
			children: before ? [dropped, node] : [node, dropped],
		};
	});

export const moveView = (
	root: LayoutNode,
	viewId: ViewId,
	anchorViewId: ViewId,
	zone: DockZone,
): LayoutNode => {
	if (viewId === anchorViewId) {
		return root;
	}
	const fromPath = findView(root, viewId);
	const toPath = findView(root, anchorViewId);
	if (!toPath) {
		return root;
	}
	if (zone === "center" && fromPath && samePath(fromPath, toPath)) {
		return setActive(root, viewId);
	}
	const without = removeView(root, viewId);
	const anchorPath = findView(without, anchorViewId);
	if (!anchorPath) {
		return root;
	}
	return insertView(without, viewId, anchorPath, zone);
};

export const setTabsViews = (
	root: LayoutNode,
	anchorViewId: ViewId,
	views: ReadonlyArray<ViewId>,
): LayoutNode => {
	const path = findView(root, anchorViewId);
	if (!path) {
		return root;
	}
	return updateNode(root, path, (node) =>
		node.type === "tabs"
			? {
					type: "tabs",
					views,
					active: views.includes(node.active)
						? node.active
						: (views[0] ?? ""),
				}
			: node,
	);
};

export const resizeSplit = (
	root: LayoutNode,
	path: ReadonlyArray<number>,
	dividerIndex: number,
	delta: number,
): LayoutNode =>
	updateNode(root, path, (node) =>
		node.type === "split"
			? {
					...node,
					sizes: adjustSizes(node.sizes, dividerIndex, delta),
				}
			: node,
	);

export const defaultWorkspace = (sceneView: ViewId): Workspace => ({
	version: WORKSPACE_VERSION,
	root: {
		type: "split",
		direction: "row",
		sizes: [0.22, 0.78],
		children: [
			{ type: "tabs", views: ["tree"], active: "tree" },
			{
				type: "split",
				direction: "column",
				sizes: [0.7, 0.3],
				children: [
					{ type: "tabs", views: [sceneView], active: sceneView },
					{
						type: "tabs",
						views: ["asset-browser"],
						active: "asset-browser",
					},
				],
			},
		],
	},
	focused: sceneView,
});
