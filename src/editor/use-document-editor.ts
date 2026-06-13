import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { History } from "./history";
import type { Subscribable } from "./subscribable";

type EditableDocument = Subscribable & Readonly<{ dirty: boolean }>;

type Undoable = Readonly<{ canUndo: boolean; canRedo: boolean }>;

export const useDocumentEditor = <D extends EditableDocument>(
	options: Readonly<{
		deps: ReadonlyArray<unknown>;
		load: () => D | Promise<D>;
		active: boolean;
		onDirty: (dirty: boolean) => void;
		onReset?: () => void;
		onChange?: () => void;
	}>,
): Readonly<{
	doc: D | null;
	dirty: boolean;
	history: History;
	undoable: Undoable;
}> => {
	const { deps, load, active, onDirty, onReset, onChange } = options;
	const [history] = useState(() => new History());
	const [doc, setDoc] = useState<D | null>(null);
	const [dirty, setDirty] = useState(false);
	const [undoable, setUndoable] = useState<Undoable>({
		canUndo: false,
		canRedo: false,
	});

	const loadRef = useRef(load);
	loadRef.current = load;
	const resetRef = useRef(onReset);
	resetRef.current = onReset;
	const changeRef = useRef(onChange);
	changeRef.current = onChange;
	const dirtyCbRef = useRef(onDirty);
	dirtyCbRef.current = onDirty;

	useEffect(() => {
		let cancelled = false;
		resetRef.current?.();
		history.clear();
		setDoc(null);
		setDirty(false);
		dirtyCbRef.current(false);
		const result = loadRef.current();
		if (result instanceof Promise) {
			void result.then((loaded) => {
				if (!cancelled) {
					setDoc(loaded);
				}
			});
		} else {
			setDoc(result);
		}
		return () => {
			cancelled = true;
		};
	}, [history, ...deps]);

	useEffect(() => {
		if (!doc) {
			return;
		}
		const sync = () => {
			setDirty(doc.dirty);
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

	useHotkeys(
		"mod+z",
		(e) => {
			e.preventDefault();
			history.undo();
		},
		{ preventDefault: true, enabled: active },
		[history, active],
	);
	useHotkeys(
		"mod+y",
		(e) => {
			e.preventDefault();
			history.redo();
		},
		{ preventDefault: true, enabled: active },
		[history, active],
	);

	return { doc, dirty, history, undoable };
};
