import {
	allViewIds,
	findView,
	type LayoutNode,
	type ViewId,
	type WindowLayout,
} from "./layout";
import { isSceneView } from "./view-registry";

/** The first scene view in document order within `root`, or `null`. */
export const firstSceneView = (root: LayoutNode): ViewId | null =>
	allViewIds(root).find(isSceneView) ?? null;

/**
 * Resolve the scene view a document-scoped command (save/undo/delete/nudge/…)
 * targets within its invoking `window` (plan A2 command routing). Prefers the
 * window's last-interacted scene view (`pinned`) while it is still present,
 * falling back to the window's first scene view. Returns `null` when the window
 * hosts no scene view — the command then no-ops rather than reaching across
 * windows. Resolution is window-local by construction: it only ever inspects the
 * one window handed to it.
 */
export const resolveCommandSceneView = (
	window: WindowLayout,
	pinned: ViewId | null | undefined,
): ViewId | null => {
	if (pinned && findView(window.root, pinned)) {
		return pinned;
	}
	return firstSceneView(window.root);
};
