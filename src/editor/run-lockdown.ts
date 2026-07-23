import type { ViewId, WindowId } from "./workspace/layout";

/**
 * Pure derivations for the editor's "one run at a time" lockdown (plan lines
 * 146-151). While a run is active it renders only in its anchor view; every
 * other scene view is frozen and darkened, and closing the anchor (its tab or
 * window) stops the run. Kept pure and free of React/host state so the rules are
 * unit-testable without a live shell.
 */

/**
 * Whether a scene view is locked out — frozen (not stepped or re-rendered) and
 * rendered darkened. True whenever a run is active and the view is not the run's
 * anchor; the anchor (the sole view drawing the live run world) is never locked
 * out. `anchorViewId` is `null` when no run is active.
 *
 * @example
 * isSceneLockedOut("scene:a", "scene:a"); // false — the anchor
 * isSceneLockedOut("scene:a", "scene:b"); // true  — a bystander scene
 * isSceneLockedOut(null, "scene:b");      // false — no run active
 */
export const isSceneLockedOut = (
	anchorViewId: ViewId | null,
	viewId: ViewId,
): boolean => anchorViewId !== null && viewId !== anchorViewId;

/**
 * Whether closing `closingViewId` must stop the active run first: true when it
 * is the run's anchor view. Closing the anchor tab ends the run — the SceneView
 * the run references is about to be disposed — and never prompts.
 */
export const runStopsOnViewClose = (
	anchorViewId: ViewId | null,
	closingViewId: ViewId,
): boolean => anchorViewId !== null && anchorViewId === closingViewId;

/**
 * Whether closing `closingWindowId` must stop the active run first: true when
 * the run's anchor view lives in that window. Closing the anchor's window ends
 * the run and never prompts. `anchorWindowId` is `null` when no run is active or
 * the anchor is not currently placed in any window.
 */
export const runStopsOnWindowClose = (
	anchorWindowId: WindowId | null,
	closingWindowId: WindowId,
): boolean =>
	anchorWindowId !== null && anchorWindowId === closingWindowId;
