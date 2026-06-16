import {
	allViewIds,
	defaultWorkspace,
	type LayoutNode,
	removeView,
	type ViewId,
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
		if (parsed.version !== WORKSPACE_VERSION || !parsed.root) {
			return defaultWorkspace(fallbackSceneView);
		}
		let root = parsed.root;
		for (const id of allViewIds(root)) {
			if (!isValid(id)) {
				root = removeView(root, id);
			}
		}
		if (!hasView(root)) {
			return defaultWorkspace(fallbackSceneView);
		}
		const focused =
			parsed.focused && isValid(parsed.focused)
				? parsed.focused
				: null;
		return { version: WORKSPACE_VERSION, root, focused };
	} catch {
		return defaultWorkspace(fallbackSceneView);
	}
};

let timer: number | undefined;

export const saveWorkspace = (workspace: Workspace): void => {
	window.clearTimeout(timer);
	timer = window.setTimeout(() => {
		try {
			localStorage.setItem(KEY, JSON.stringify(workspace));
		} catch (error) {
			void error;
		}
	}, 200);
};
