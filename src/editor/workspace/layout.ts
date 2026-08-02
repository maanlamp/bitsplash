export type ViewId = string;

/**
 * Identifier for an editor window. The hub (main) window always carries
 * {@link HUB_WINDOW_ID}; satellite (torn-out) windows get generated ids.
 * Window bounds/maximized state are NOT part of the layout schema — the
 * Electron main process owns those, keyed by this same id.
 */
export type WindowId = string;

/**
 * Stable identifier for a {@link TabsNode}. Assigned on creation and preserved
 * across pure tree transforms, so the closed-stack reopen fallback chain can
 * refer back to the exact tab group a view was closed from.
 */
export type TabGroupId = string;

export type SplitDirection = "row" | "column";

export type DockZone = "center" | "top" | "bottom" | "left" | "right";

/**
 * The fixed id of the hub (main) window; distinguishes it from satellites.
 *
 * The Electron main process keeps its own copy of this literal
 * (`HUB_WINDOW_ID` in `src/desktop/main.cjs`) rather than importing this one:
 * main is a separate architectural layer (desktop) from the editor renderer,
 * and a shared module would cross the layer boundary the project forbids. The
 * two are a hand-kept cross-layer contract — keep them in sync if either changes.
 */
export const HUB_WINDOW_ID: WindowId = "hub";

export type SplitNode = Readonly<{
	type: "split";
	direction: SplitDirection;
	sizes: ReadonlyArray<number>;
	children: ReadonlyArray<LayoutNode>;
}>;

export type TabsNode = Readonly<{
	type: "tabs";
	id: TabGroupId;
	views: ReadonlyArray<ViewId>;
	active: ViewId;
}>;

export type LayoutNode = SplitNode | TabsNode;

/**
 * One editor window's content: its layout tree and window-local focused view.
 * Bounds/maximized state live in the main process's manifest, keyed by `id`.
 */
export type WindowLayout = Readonly<{
	id: WindowId;
	root: LayoutNode;
	focused: ViewId | null;
}>;

/**
 * The full multi-window workspace. Exactly one window carries
 * {@link HUB_WINDOW_ID}; the rest are satellites. Every operation over a
 * `Workspace` is a pure transform (readonly in, readonly out).
 */
export type Workspace = Readonly<{
	version: number;
	windows: ReadonlyArray<WindowLayout>;
	/**
	 * Scene views whose audio bus the user has muted. A list rather than a field
	 * on the layout tree because the tree is pure structure — a view moves
	 * between tab groups and windows constantly, and its mute has to survive
	 * every one of those transforms without being carried by hand.
	 */
	mutedViews: ReadonlyArray<ViewId>;
}>;

export const WORKSPACE_VERSION = 4;

const MIN_SIZE = 0.08;

const makeCounter = (prefix: string): (() => string) => {
	let n = 0;
	return () => `${prefix}-${++n}`;
};

let tabGroupGen: () => TabGroupId = () => crypto.randomUUID();
let windowGen: () => WindowId = () => crypto.randomUUID();

/** Mint a fresh tab-group id from the active generator. */
export const nextTabGroupId = (): TabGroupId => tabGroupGen();

/** Mint a fresh satellite window id from the active generator. */
export const nextWindowId = (): WindowId => windowGen();

/** Install a custom tab-group id generator (used by tests for determinism). */
export const setTabGroupIdGenerator = (
	gen: () => TabGroupId,
): void => {
	tabGroupGen = gen;
};

/** Install a custom window id generator (used by tests for determinism). */
export const setWindowIdGenerator = (gen: () => WindowId): void => {
	windowGen = gen;
};

/**
 * Reset both id generators to deterministic, restart-from-1 counters
 * (`tg-1`, `win-1`, …). Intended for tests so tree shapes are reproducible.
 */
export const resetLayoutIds = (): void => {
	tabGroupGen = makeCounter("tg");
	windowGen = makeCounter("win");
};

const tabs = (
	views: ReadonlyArray<ViewId>,
	active?: ViewId,
	id: TabGroupId = nextTabGroupId(),
): TabsNode => ({
	type: "tabs",
	id,
	views,
	active: active ?? views[0] ?? "",
});

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

/**
 * The id of the tab group directly containing `viewId`, or `null` if the view
 * is not in this tree. Used to stamp closed-view records with their origin.
 */
export const tabGroupOfView = (
	root: LayoutNode,
	viewId: ViewId,
): TabGroupId | null => {
	if (root.type === "tabs") {
		return root.views.includes(viewId) ? root.id : null;
	}
	for (const child of root.children) {
		const found = tabGroupOfView(child, viewId);
		if (found) {
			return found;
		}
	}
	return null;
};

const firstTabsPath = (
	root: LayoutNode,
	path: ReadonlyArray<number> = [],
): ReadonlyArray<number> => {
	if (root.type === "tabs") {
		return path;
	}
	return firstTabsPath(root.children[0]!, [...path, 0]);
};

const emptyTabs = (): TabsNode => tabs([], "");

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
		return { type: "tabs", id: node.id, views, active };
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

/**
 * Drop every view in `root` for which `keep` returns false, collapsing emptied
 * tab groups and splits away (via {@link removeView}). Returns an empty tab
 * group if nothing survives.
 */
export const pruneViews = (
	root: LayoutNode,
	keep: (id: ViewId) => boolean,
): LayoutNode => {
	let next = root;
	for (const id of allViewIds(root)) {
		if (!keep(id)) {
			next = removeView(next, id);
		}
	}
	return next;
};

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
				...node,
				views: [...node.views, viewId],
				active: viewId,
			};
		}
		const dropped = tabs([viewId], viewId);
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
					...node,
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

const refocus = (
	root: LayoutNode,
	focused: ViewId | null,
): ViewId | null =>
	focused && findView(root, focused)
		? focused
		: (allViewIds(root)[0] ?? null);

const addViewToRoot = (
	root: LayoutNode,
	viewId: ViewId,
	anchorViewId: ViewId | null,
	zone: DockZone,
): LayoutNode => {
	const anchorPath = anchorViewId
		? findView(root, anchorViewId)
		: null;
	if (anchorPath) {
		return insertView(root, viewId, anchorPath, zone);
	}
	return insertView(root, viewId, firstTabsPath(root), "center");
};

/** Whether `viewId`'s own bus is muted. */
export const isViewMuted = (ws: Workspace, viewId: ViewId): boolean =>
	ws.mutedViews.includes(viewId);

/**
 * Mute or unmute one view, persisted with the workspace.
 *
 * @example
 * updateWorkspace((ws) => setViewMuted(ws, "scene:demo", true));
 */
export const setViewMuted = (
	ws: Workspace,
	viewId: ViewId,
	muted: boolean,
): Workspace => {
	if (isViewMuted(ws, viewId) === muted) {
		return ws;
	}
	return {
		...ws,
		mutedViews: muted
			? [...ws.mutedViews, viewId]
			: ws.mutedViews.filter((id) => id !== viewId),
	};
};

/** All windows in the workspace. */
export const listWindows = (
	ws: Workspace,
): ReadonlyArray<WindowLayout> => ws.windows;

/** The window with the given id, or `undefined`. */
export const getWindow = (
	ws: Workspace,
	id: WindowId,
): WindowLayout | undefined =>
	ws.windows.find((window) => window.id === id);

/** The id of the window whose tree contains `viewId`, or `null`. */
export const windowOfView = (
	ws: Workspace,
	viewId: ViewId,
): WindowId | null => {
	for (const window of ws.windows) {
		if (findView(window.root, viewId)) {
			return window.id;
		}
	}
	return null;
};

/** Immutably replace one window via `update`, leaving the rest untouched. */
export const updateWindow = (
	ws: Workspace,
	id: WindowId,
	update: (window: WindowLayout) => WindowLayout,
): Workspace => ({
	...ws,
	windows: ws.windows.map((window) =>
		window.id === id ? update(window) : window,
	),
});

/** Immutably replace one window's root, re-validating its focused view. */
export const replaceWindowRoot = (
	ws: Workspace,
	id: WindowId,
	root: LayoutNode,
): Workspace =>
	updateWindow(ws, id, (window) => ({
		...window,
		root,
		focused: refocus(root, window.focused),
	}));

/**
 * Drop satellite windows whose tree holds no views. The hub is never dropped —
 * it renders an empty state instead.
 */
export const collapseEmptyWindows = (ws: Workspace): Workspace => ({
	...ws,
	windows: ws.windows.filter(
		(window) =>
			window.id === HUB_WINDOW_ID ||
			allViewIds(window.root).length > 0,
	),
});

/**
 * Move a view out of whichever window currently holds it into `target`'s
 * window, docked at `target.anchorViewId`/`target.zone` (or, when no anchor is
 * given, appended to the target window's first tab group). The source window
 * is collapsed if it becomes empty (unless it is the hub).
 */
export const moveViewAcrossWindows = (
	ws: Workspace,
	viewId: ViewId,
	target: Readonly<{
		windowId: WindowId;
		anchorViewId: ViewId | null;
		zone: DockZone;
	}>,
): Workspace => {
	const sourceId = windowOfView(ws, viewId);
	if (sourceId === null || !getWindow(ws, target.windowId)) {
		return ws;
	}
	const removed = updateWindow(ws, sourceId, (window) => {
		const root = removeView(window.root, viewId);
		return {
			...window,
			root,
			focused: refocus(root, window.focused),
		};
	});
	const added = updateWindow(removed, target.windowId, (window) => ({
		...window,
		root: addViewToRoot(
			window.root,
			viewId,
			target.anchorViewId,
			target.zone,
		),
		focused: viewId,
	}));
	return collapseEmptyWindows(added);
};

/**
 * Tear `viewId` out into a brand-new satellite window (single tab group)
 * removed from its source window. The source is collapsed if it empties
 * (unless it is the hub).
 */
export const spawnWindowWithView = (
	ws: Workspace,
	viewId: ViewId,
	windowId: WindowId = nextWindowId(),
): Workspace => {
	const sourceId = windowOfView(ws, viewId);
	if (sourceId === null) {
		return ws;
	}
	const removed = updateWindow(ws, sourceId, (window) => {
		const root = removeView(window.root, viewId);
		return {
			...window,
			root,
			focused: refocus(root, window.focused),
		};
	});
	const spawned: Workspace = {
		...removed,
		windows: [
			...removed.windows,
			{ id: windowId, root: tabs([viewId], viewId), focused: viewId },
		],
	};
	return collapseEmptyWindows(spawned);
};

/**
 * Fold every view of `sourceId`'s tree into `targetId`'s window (appended to
 * the target's first tab group) and drop the now-empty source window. Used
 * when a satellite dies or its monitor disappears and its views re-dock into
 * the hub. The hub can never be a merge source.
 */
export const mergeWindows = (
	ws: Workspace,
	sourceId: WindowId,
	targetId: WindowId,
): Workspace => {
	if (sourceId === targetId || sourceId === HUB_WINDOW_ID) {
		return ws;
	}
	const source = getWindow(ws, sourceId);
	const target = getWindow(ws, targetId);
	if (!source || !target) {
		return ws;
	}
	let root = target.root;
	for (const viewId of allViewIds(source.root)) {
		root = addViewToRoot(root, viewId, null, "center");
	}
	const merged = updateWindow(ws, targetId, (window) => ({
		...window,
		root,
	}));
	return {
		...merged,
		windows: merged.windows.filter(
			(window) => window.id !== sourceId,
		),
	};
};

export const defaultWorkspace = (sceneView: ViewId): Workspace => ({
	version: WORKSPACE_VERSION,
	mutedViews: [],
	windows: [
		{
			id: HUB_WINDOW_ID,
			focused: sceneView,
			root: {
				type: "split",
				direction: "row",
				sizes: [0.22, 0.78],
				children: [
					{
						type: "split",
						direction: "column",
						sizes: [0.5, 0.5],
						children: [
							tabs(["tree"], "tree"),
							tabs(["asset-browser"], "asset-browser"),
						],
					},
					{
						type: "split",
						direction: "column",
						sizes: [0.85, 0.15],
						children: [
							{
								type: "split",
								direction: "row",
								sizes: [0.75, 0.25],
								children: [
									tabs([sceneView], sceneView),
									tabs(["inspector"], "inspector"),
								],
							},
							tabs(["console", "profiler"], "console"),
						],
					},
				],
			},
		},
	],
});
