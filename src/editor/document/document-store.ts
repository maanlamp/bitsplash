import type { ViewId } from "../workspace/layout";
import {
	DocumentEntry,
	type DocumentFactory,
	type EditableDocument,
} from "./document-entry";

/**
 * Module-singleton store of open sprite/audio views keyed by `ViewId`, holding
 * each view's document, undo history, controllers, and declared view-state in a
 * {@link DocumentEntry}. Because the entries live here — in the shell, one JS
 * heap for all windows — and not inside the view component, a cross-window move
 * (which remounts the component and rebuilds its WebGL canvas) reuses the same
 * entry: document state and undo history are untouched by construction, and the
 * declared view-state (camera pan/zoom, tool, timeline scroll) is restored from
 * the entry on the fresh mount (plan lines 53-58, WS-C5).
 *
 * `SceneDocument` needs no equivalent — it already outlives its view via
 * `Project`; this store is only for sprite/audio documents.
 */
const entries = new Map<
	ViewId,
	DocumentEntry<EditableDocument, unknown>
>();

/**
 * Get the entry for `viewId`, creating it on first request. A later call with
 * the same `loadKey` returns the same entry (this is how a remount preserves the
 * document); a call with a changed `loadKey` reloads the entry in place.
 */
export const acquireDocument = <D extends EditableDocument, C>(
	viewId: ViewId,
	factory: DocumentFactory<D, C>,
): DocumentEntry<D, C> => {
	const existing = entries.get(viewId) as
		| DocumentEntry<D, C>
		| undefined;
	if (existing) {
		if (!existing.matches(factory.loadKey)) {
			existing.reload(factory);
		}
		return existing;
	}
	const created = new DocumentEntry<D, C>(factory);
	entries.set(
		viewId,
		created as unknown as DocumentEntry<EditableDocument, unknown>,
	);
	return created;
};

/**
 * Dispose the entry for `viewId` when its view is closed, freeing the document,
 * undo history, and controllers. Called by the shell's view-close path
 * (`app.tsx` `removeViewNow`); a no-op for a `viewId` with no entry, so it is
 * safe to call for every closed view regardless of kind.
 */
export const disposeDocument = (viewId: ViewId): void => {
	const entry = entries.get(viewId);
	if (!entry) {
		return;
	}
	entry.dispose();
	entries.delete(viewId);
};

/** Whether an entry currently exists for `viewId` (test/introspection). */
export const hasDocumentEntry = (viewId: ViewId): boolean =>
	entries.has(viewId);
