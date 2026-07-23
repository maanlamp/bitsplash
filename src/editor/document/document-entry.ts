import { History } from "../history";
import { Subscribable } from "../subscribable";
import { DocumentViewState } from "./document-view-state";

/** A document the editor can open: notifies on mutation and reports dirtiness. */
export type EditableDocument = Subscribable &
	Readonly<{ dirty: boolean }>;

/**
 * How a {@link DocumentEntry} builds and rebuilds itself. Supplied by the view's
 * hook at every render; the store consults `loadKey` to decide whether a fresh
 * call describes the same document (survive the remount) or a genuinely new load
 * (reset in place).
 */
export type DocumentFactory<
	D extends EditableDocument,
	C,
> = Readonly<{
	/** Identity of the document to load; a change reloads the entry in place. */
	loadKey: ReadonlyArray<unknown>;
	/** Load (or build) the document; may be async. */
	load: () => D | Promise<D>;
	/**
	 * Build the document-independent controllers (tool/view state). Created once
	 * with the entry and kept across remounts and reloads, so tool selection and
	 * options survive a cross-window move.
	 */
	createControllers: (history: History) => C;
	/** Tear down controllers when the entry is disposed. */
	disposeControllers?: (controllers: C) => void;
	/** Reset controllers when the document identity changes (a reload). */
	onReset?: (controllers: C) => void;
}>;

/**
 * The shell-owned state of one open sprite/audio view: the loaded document, its
 * undo {@link History}, the view's controllers, and its {@link DocumentViewState}.
 * Held in the {@link DocumentStore} keyed by `ViewId` so all of it outlives the
 * view component — a cross-window move remounts the component but reuses this
 * entry, so the document and undo history are untouched by construction (plan
 * lines 53-58).
 */
export class DocumentEntry<
	D extends EditableDocument,
	C,
> extends Subscribable {
	readonly history = new History();
	readonly viewState = new DocumentViewState();

	private _document: D | null = null;
	private readonly _controllers: C;
	private readonly disposeControllers?: (controllers: C) => void;
	private loadKey: ReadonlyArray<unknown>;
	private loadToken = 0;

	constructor(factory: DocumentFactory<D, C>) {
		super();
		this._controllers = factory.createControllers(this.history);
		this.disposeControllers = factory.disposeControllers;
		this.loadKey = factory.loadKey;
		this.beginLoad(factory.load);
	}

	/** The loaded document, or `null` while an async load is in flight. */
	get document(): D | null {
		return this._document;
	}

	/** The view's controllers, created with the entry and stable for its life. */
	get controllers(): C {
		return this._controllers;
	}

	/** Whether `loadKey` still describes the document this entry holds. */
	matches(loadKey: ReadonlyArray<unknown>): boolean {
		return sameKey(this.loadKey, loadKey);
	}

	/**
	 * Reload after a `loadKey` change (a new document under the same `ViewId`,
	 * e.g. the new-sprite dialog re-run with different dimensions): reset the
	 * controllers and clear undo, then load afresh. Controllers persist — only
	 * their reset hook runs — matching the pre-store behavior where the same
	 * component instance kept its tool state across a deps change.
	 */
	reload(factory: DocumentFactory<D, C>): void {
		this.loadKey = factory.loadKey;
		factory.onReset?.(this._controllers);
		this.beginLoad(factory.load);
	}

	dispose(): void {
		this.loadToken += 1;
		this.history.clear();
		this._document = null;
		this.disposeControllers?.(this._controllers);
	}

	private beginLoad(load: () => D | Promise<D>): void {
		const token = (this.loadToken += 1);
		this.history.clear();
		this._document = null;
		this.notify();
		const result = load();
		if (result instanceof Promise) {
			void result.then((loaded) => {
				if (token === this.loadToken) {
					this._document = loaded;
					this.notify();
				}
			});
		} else {
			this._document = result;
			this.notify();
		}
	}
}

const sameKey = (
	a: ReadonlyArray<unknown>,
	b: ReadonlyArray<unknown>,
): boolean =>
	a.length === b.length &&
	a.every((value, i) => Object.is(value, b[i]));
