import {
	allViewIds,
	HUB_WINDOW_ID,
	type ViewId,
	type WindowId,
	type Workspace,
} from "./layout";

/**
 * The dirty documents a window close (or app quit) would discard, as their view
 * ids (plan lines 96-100). One view per document is a global invariant, so a
 * dirty view maps 1:1 to a dirty document — the returned list has no duplicates.
 *
 * Closing the hub quits the app, so its guard aggregates every window; closing a
 * satellite lists only that window's dirty documents. `isDirty` reports whether a
 * view's document has unsaved edits. Pure and workspace-derived so the
 * document-unit "last-view" resolution is unit-testable without a live shell.
 *
 * @example
 * // Closing a satellite: only that window's dirty docs.
 * dirtyDocumentsForClose(ws, "sat", isDirty);
 * // Closing the hub: dirty docs across every window (app quit).
 * dirtyDocumentsForClose(ws, HUB_WINDOW_ID, isDirty);
 */
export const dirtyDocumentsForClose = (
	ws: Workspace,
	windowId: WindowId,
	isDirty: (id: ViewId) => boolean,
): ReadonlyArray<ViewId> => {
	const windows =
		windowId === HUB_WINDOW_ID
			? ws.windows
			: ws.windows.filter((window) => window.id === windowId);
	const dirty: ViewId[] = [];
	for (const window of windows) {
		for (const id of allViewIds(window.root)) {
			if (isDirty(id)) {
				dirty.push(id);
			}
		}
	}
	return dirty;
};
