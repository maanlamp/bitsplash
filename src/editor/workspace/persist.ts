import {
	allViewIds,
	defaultWorkspace,
	HUB_WINDOW_ID,
	type LayoutNode,
	pruneViews,
	type ViewId,
	type WindowLayout,
	type Workspace,
	WORKSPACE_VERSION,
} from "./layout";

const KEY = "editor-workspace";

const hasView = (node: LayoutNode): boolean => {
	if (node.type === "tabs") {
		return node.views.length > 0;
	}
	return node.children.some(hasView);
};

const pruneWindow = (
	window: WindowLayout,
	isValid: (id: ViewId) => boolean,
): WindowLayout => {
	const root = pruneViews(window.root, isValid);
	const focused =
		window.focused && isValid(window.focused) && hasView(root)
			? window.focused
			: null;
	return { ...window, root, focused };
};

/**
 * Load the persisted multi-window workspace, pruning views the current session
 * cannot validate. Empty satellite windows are dropped; the hub always
 * survives (rendering an empty state if it has no views). If nothing validates
 * across any window — or the stored blob is stale/malformed — the default
 * single-window workspace is returned instead.
 */
export const loadWorkspace = (
	isValid: (id: ViewId) => boolean,
	fallbackSceneView: ViewId,
): Workspace => {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) {
			return defaultWorkspace(fallbackSceneView);
		}
		const parsed = JSON.parse(raw) as Workspace;
		if (
			parsed.version !== WORKSPACE_VERSION ||
			!Array.isArray(parsed.windows) ||
			!parsed.windows.some((window) => window.id === HUB_WINDOW_ID)
		) {
			return defaultWorkspace(fallbackSceneView);
		}
		const windows = parsed.windows
			.map((window) => pruneWindow(window, isValid))
			.filter(
				(window) =>
					window.id === HUB_WINDOW_ID || hasView(window.root),
			);
		if (!windows.some((window) => hasView(window.root))) {
			return defaultWorkspace(fallbackSceneView);
		}
		const surviving = new Set(
			windows.flatMap((window) => allViewIds(window.root)),
		);
		return {
			version: WORKSPACE_VERSION,
			windows,
			mutedViews: (Array.isArray(parsed.mutedViews)
				? parsed.mutedViews
				: []
			).filter((id) => surviving.has(id)),
		};
	} catch {
		return defaultWorkspace(fallbackSceneView);
	}
};

let timer: number | undefined;
let pending: Workspace | null = null;

const write = (workspace: Workspace): void => {
	try {
		localStorage.setItem(KEY, JSON.stringify(workspace));
	} catch (error) {
		void error;
	}
};

/**
 * Debounced persist of the workspace. The last value wins; call
 * {@link flushWorkspace} to force it out synchronously (e.g. from a
 * `beforeunload` handler) before the debounce fires.
 */
export const saveWorkspace = (workspace: Workspace): void => {
	pending = workspace;
	window.clearTimeout(timer);
	timer = window.setTimeout(() => {
		if (pending) {
			write(pending);
			pending = null;
		}
	}, 200);
};

/**
 * Synchronously flush any debounced workspace write. Safe to call when nothing
 * is pending. Wired from a `beforeunload` handler so a reload never drops the
 * last mutation.
 */
export const flushWorkspace = (): void => {
	if (pending === null) {
		return;
	}
	window.clearTimeout(timer);
	write(pending);
	pending = null;
};
