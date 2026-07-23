import type { DropTarget } from "./hit-test";
import {
	allViewIds,
	type DockZone,
	findView,
	type ViewId,
	type WindowId,
	windowOfView,
	type Workspace,
} from "./layout";

/**
 * The layout mutation a tab-drop should perform, resolved purely from the drop
 * target and drag context. The shell wires each kind to the matching pure layout
 * op ({@link import("./layout").setTabsViews} / `moveView` /
 * `moveViewAcrossWindows` / `spawnWindowWithView`).
 */
export type DropAction =
	| Readonly<{
			kind: "reorder";
			windowId: WindowId;
			anchor: ViewId;
			order: ReadonlyArray<ViewId>;
	  }>
	| Readonly<{
			kind: "move-in-window";
			windowId: WindowId;
			viewId: ViewId;
			anchor: ViewId;
			zone: DockZone;
	  }>
	| Readonly<{
			kind: "move-across";
			viewId: ViewId;
			windowId: WindowId;
			anchor: ViewId;
			zone: DockZone;
	  }>
	| Readonly<{
			kind: "spawn";
			viewId: ViewId;
			/**
			 * When set, the view is the only tab of an existing satellite: that OS
			 * window is repositioned/reused instead of spawning a new one, so the
			 * workspace layout is left unchanged (plan lines 88-92).
			 */
			reuseWindowId: WindowId | null;
			/** The satellite id a fresh spawn will use (minted by the gesture). */
			windowId?: WindowId;
	  }>
	| Readonly<{ kind: "none" }>;

/**
 * Whether `viewId` is the sole view of its whole window (not merely the only tab
 * of one tab group). Dropping such a view onto empty desktop reuses/repositions
 * its existing OS window instead of spawn-new-then-close-old (plan lines 88-92).
 */
export const isOnlyTabOfWindow = (
	ws: Workspace,
	viewId: ViewId,
): boolean => {
	const windowId = windowOfView(ws, viewId);
	if (windowId === null) {
		return false;
	}
	const window = ws.windows.find((w) => w.id === windowId)!;
	const views = allViewIds(window.root);
	return views.length === 1 && views[0] === viewId;
};

/**
 * Resolve the layout mutation for a drop. `target` is the resolved hit (or
 * `null` for empty desktop); `viewId` is the dragged view and `sourceWindowId`
 * its current window. A reorder or same-window dock stays in-window; a dock into
 * another window moves across; empty desktop spawns (reusing the source window
 * when the view is its only tab).
 */
export const resolveDropAction = (
	target: DropTarget | null,
	ws: Workspace,
	viewId: ViewId,
	sourceWindowId: WindowId,
): DropAction => {
	if (!target) {
		return {
			kind: "spawn",
			viewId,
			reuseWindowId: isOnlyTabOfWindow(ws, viewId)
				? sourceWindowId
				: null,
		};
	}
	if (target.mode === "reorder") {
		return {
			kind: "reorder",
			windowId: target.windowId,
			anchor: target.anchor,
			order: target.order,
		};
	}
	// A center-drop onto the dragged view's own group is a no-op; the pointer is
	// already over it and nothing should move.
	if (
		target.zone === "center" &&
		target.windowId === sourceWindowId &&
		sameGroup(ws, viewId, target.anchor)
	) {
		return { kind: "none" };
	}
	if (target.windowId === sourceWindowId) {
		return {
			kind: "move-in-window",
			windowId: sourceWindowId,
			viewId,
			anchor: target.anchor,
			zone: target.zone,
		};
	}
	return {
		kind: "move-across",
		viewId,
		windowId: target.windowId,
		anchor: target.anchor,
		zone: target.zone,
	};
};

const sameGroup = (ws: Workspace, a: ViewId, b: ViewId): boolean => {
	const window = ws.windows.find((w) => findView(w.root, a));
	if (!window) {
		return false;
	}
	const pathA = findView(window.root, a);
	const pathB = findView(window.root, b);
	return (
		!!pathA &&
		!!pathB &&
		pathA.length === pathB.length &&
		pathA.every((v, i) => v === pathB[i])
	);
};
