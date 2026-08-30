import {
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useScopedHotkeys } from "./window/use-scoped-hotkeys";
import type {
	DocumentFactory,
	EditableDocument,
} from "./document/document-entry";
import type { DocumentViewState } from "./document/document-view-state";
import { acquireDocument } from "./document/document-store";
import type { History } from "./history";
import type { ViewId } from "./workspace/layout";

type Undoable = Readonly<{ canUndo: boolean; canRedo: boolean }>;

/**
 * Consume the shell-level {@link acquireDocument} store for a sprite/audio view.
 * The document, undo {@link History}, controllers, and declared view-state live
 * in the store keyed by `viewId`, so this hook owns no document state itself: it
 * subscribes the component to the entry for re-render, forwards dirtiness and
 * change notifications to the shell, and binds undo/redo. The view component
 * therefore survives a cross-window move (a remount) with its document and undo
 * history intact.
 *
 * Behavior matches the pre-store hook in a single window: a fresh view creates a
 * fresh entry, loading exactly as before; a `loadKey` change reloads in place.
 */
export const useDocumentEditor = <D extends EditableDocument, C>(
	viewId: ViewId,
	options: Readonly<{
		loadKey: ReadonlyArray<unknown>;
		load: () => D | Promise<D>;
		createControllers: (history: History) => C;
		disposeControllers?: (controllers: C) => void;
		onReset?: (controllers: C) => void;
		active: boolean;
		onDirty: (dirty: boolean) => void;
		onChange?: () => void;
	}>,
): Readonly<{
	doc: D | null;
	history: History;
	controllers: C;
	viewState: DocumentViewState;
	undoable: Undoable;
}> => {
	const {
		loadKey,
		load,
		createControllers,
		disposeControllers,
		onReset,
		active,
		onDirty,
		onChange,
	} = options;

	const factory: DocumentFactory<D, C> = {
		loadKey,
		load,
		createControllers,
		disposeControllers,
		onReset,
	};
	const entry = acquireDocument<D, C>(viewId, factory);
	useSyncExternalStore(entry.subscribe, () => entry.version);

	const doc = entry.document;
	const { history, viewState, controllers } = entry;

	const [undoable, setUndoable] = useState<Undoable>({
		canUndo: history.canUndo,
		canRedo: history.canRedo,
	});

	const changeRef = useRef(onChange);
	changeRef.current = onChange;
	const dirtyCbRef = useRef(onDirty);
	dirtyCbRef.current = onDirty;

	useEffect(() => {
		if (!doc) {
			dirtyCbRef.current(false);
			return undefined;
		}
		const sync = () => {
			dirtyCbRef.current(doc.dirty);
			changeRef.current?.();
		};
		sync();
		return doc.subscribe(sync);
	}, [doc]);

	useEffect(
		() =>
			history.subscribe(() =>
				setUndoable({
					canUndo: history.canUndo,
					canRedo: history.canRedo,
				}),
			),
		[history],
	);

	useScopedHotkeys(
		"mod+z",
		(e) => {
			e.preventDefault();
			history.undo();
		},
		{ preventDefault: true, enabled: active },
		[history, active],
	);
	useScopedHotkeys(
		"mod+y",
		(e) => {
			e.preventDefault();
			history.redo();
		},
		{ preventDefault: true, enabled: active },
		[history, active],
	);

	return { doc, history, controllers, viewState, undoable };
};
