import {
	type ViewId,
	type WindowId,
	windowOfView,
	type Workspace,
} from "./layout";
import { makeViewId, type ViewKind } from "./view-registry";

/**
 * A ViewBar icon's state relative to a given window (plan lines 78-80):
 * - `"here"` — the singleton is open in *this* window (filled icon);
 * - `"elsewhere"` — open in some *other* window (dimmed fill + "in another
 *   window" tooltip); summoning it activates the tab in place, never raising or
 *   stealing the view;
 * - `"closed"` — not open anywhere (plain icon); summoning opens it in this
 *   window.
 */
export type ViewBarState = "here" | "elsewhere" | "closed";

/**
 * Derive the {@link ViewBarState} of a summonable singleton `kind` for the rail
 * shown in `windowId`. Singletons are one-per-workspace, so the view lives in at
 * most one window; the state is purely a function of which window (if any) holds
 * it. Pure and workspace-derived so it is unit-testable without a live shell.
 *
 * @example
 * viewBarState(ws, "inspector", "hub"); // "here" if the inspector is in the hub
 */
export const viewBarState = (
	ws: Workspace,
	kind: ViewKind,
	windowId: WindowId,
): ViewBarState => {
	const home = windowOfView(ws, makeViewId(kind) as ViewId);
	if (home === null) {
		return "closed";
	}
	return home === windowId ? "here" : "elsewhere";
};
