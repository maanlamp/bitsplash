import type { EntityId } from "../engine/ecs";
import { Subscribable } from "./subscribable";

export type EditorMode =
	| "select"
	| "paint"
	| "fill"
	| "lasso"
	| "eraser"
	| "pan";

/**
 * A scene's transient selection. `ids` is the full selected set; `anchorId` is
 * the fixed end a range extension pivots on; `primaryId` is the "last touched"
 * entity whose bindings the single-target inspector and debug overlays read.
 *
 * The value is immutable — every mutator replaces it wholesale — so a stable
 * reference can drive `useSyncExternalStore` snapshots without a per-render
 * rebuild (plan A7).
 */
export type Selection = Readonly<{
	ids: ReadonlySet<EntityId>;
	anchorId: EntityId | null;
	primaryId: EntityId | null;
}>;

/**
 * A capture of a selection, used to snapshot/restore selection across an
 * undo/redo cursor move (plan cross-cutting: undo-reselect).
 */
export type SelectionSnapshot = Readonly<{
	ids: ReadonlyArray<EntityId>;
	anchorId: EntityId | null;
	primaryId: EntityId | null;
}>;

const EMPTY_SELECTION: Selection = {
	ids: new Set(),
	anchorId: null,
	primaryId: null,
};

const sameSelection = (a: Selection, b: Selection): boolean => {
	if (
		a.anchorId !== b.anchorId ||
		a.primaryId !== b.primaryId ||
		a.ids.size !== b.ids.size
	) {
		return false;
	}
	for (const id of a.ids) {
		if (!b.ids.has(id)) {
			return false;
		}
	}
	return true;
};

const lastOf = <T>(set: ReadonlySet<T>): T | undefined => {
	let last: T | undefined;
	for (const value of set) {
		last = value;
	}
	return last;
};

export class EditorState extends Subscribable {
	private _mode: EditorMode = "select";
	private _selection: Selection = EMPTY_SELECTION;
	private _selectionVersion = 0;
	private _hovered: EntityId | null = null;
	private _hoverListeners = new Set<() => void>();
	private _inspectingWorld = false;
	private _activeLayer: EntityId | null = null;

	get mode(): EditorMode {
		return this._mode;
	}

	get activeLayer(): EntityId | null {
		return this._activeLayer;
	}

	setActiveLayer(entity: EntityId | null): void {
		if (entity !== this._activeLayer) {
			this._activeLayer = entity;
			this.notify();
		}
	}

	/** The current selection value (a stable reference between changes). */
	get selection(): Selection {
		return this._selection;
	}

	/** Bumps only when the selection changes — a snapshot-stable counter. */
	get selectionVersion(): number {
		return this._selectionVersion;
	}

	/** The "last touched" selected entity, or `null`. */
	get primaryId(): EntityId | null {
		return this._selection.primaryId;
	}

	get anchorId(): EntityId | null {
		return this._selection.anchorId;
	}

	get selectedCount(): number {
		return this._selection.ids.size;
	}

	/** Whether `id` is in the current selection. */
	has(id: EntityId): boolean {
		return this._selection.ids.has(id);
	}

	get hovered(): EntityId | null {
		return this._hovered;
	}

	get inspectingWorld(): boolean {
		return this._inspectingWorld;
	}

	setMode(mode: EditorMode): void {
		if (mode !== this._mode) {
			this._mode = mode;
			this.notify();
		}
	}

	/**
	 * Replace the selection with `ids`. Without explicit options, `primaryId`
	 * defaults to the last id and `anchorId` follows it. Clears world-inspect.
	 */
	select(
		ids: Iterable<EntityId>,
		opts?: Readonly<{
			anchor?: EntityId | null;
			primary?: EntityId | null;
		}>,
	): void {
		const set = new Set(ids);
		const last = lastOf(set) ?? null;
		const primary = opts?.primary !== undefined ? opts.primary : last;
		const anchor = opts?.anchor !== undefined ? opts.anchor : primary;
		this.setSelection({
			ids: set,
			anchorId: anchor,
			primaryId: primary,
		});
	}

	/** Select exactly one entity, making it both anchor and primary. */
	selectOne(id: EntityId): void {
		this.setSelection({
			ids: new Set([id]),
			anchorId: id,
			primaryId: id,
		});
	}

	/** Add `id` to the selection and make it anchor + primary. */
	addToSelection(id: EntityId): void {
		const set = new Set(this._selection.ids);
		set.add(id);
		this.setSelection({ ids: set, anchorId: id, primaryId: id });
	}

	/**
	 * Toggle `id`: remove it when selected (primary falls back to another
	 * member), otherwise add it and make it anchor + primary.
	 */
	toggle(id: EntityId): void {
		const set = new Set(this._selection.ids);
		if (set.has(id)) {
			set.delete(id);
			const fallback = lastOf(set) ?? null;
			this.setSelection({
				ids: set,
				anchorId: fallback,
				primaryId: fallback,
			});
		} else {
			set.add(id);
			this.setSelection({ ids: set, anchorId: id, primaryId: id });
		}
	}

	/**
	 * Extend the selection from the current anchor to `target` within an ordered
	 * list of ids (the scene's entity order). Falls back to a single select when
	 * the anchor or target is not in `ordered`.
	 */
	selectRange(
		target: EntityId,
		ordered: ReadonlyArray<EntityId>,
	): void {
		const anchor =
			this._selection.anchorId ?? this._selection.primaryId ?? target;
		const ai = ordered.indexOf(anchor);
		const ti = ordered.indexOf(target);
		if (ai === -1 || ti === -1) {
			this.selectOne(target);
			return;
		}
		const [lo, hi] = ai <= ti ? [ai, ti] : [ti, ai];
		this.setSelection({
			ids: new Set(ordered.slice(lo, hi + 1)),
			anchorId: anchor,
			primaryId: target,
		});
	}

	clear(): void {
		if (this._selection.ids.size === 0 && !this._inspectingWorld) {
			return;
		}
		this.setSelection(EMPTY_SELECTION);
	}

	inspectWorld(): void {
		if (!this._inspectingWorld || this._selection.ids.size > 0) {
			this._inspectingWorld = true;
			this._selection = EMPTY_SELECTION;
			this._selectionVersion += 1;
			this.notify();
		}
	}

	/**
	 * Subscribe to hover changes only. Hover is picked every frame the cursor
	 * moves over the scene, so it has its own channel: waking it must not force
	 * the coarse store subscribers (the app shell, the project tree root) to
	 * re-render, which froze the view on every entity the cursor crossed. Only
	 * the fine-grained per-row hover highlight listens here.
	 */
	subscribeHover = (listener: () => void): (() => void) => {
		this._hoverListeners.add(listener);
		return () => {
			this._hoverListeners.delete(listener);
		};
	};

	setHovered(entity: EntityId | null): void {
		if (entity !== this._hovered) {
			this._hovered = entity;
			for (const listener of this._hoverListeners) {
				listener();
			}
		}
	}

	/** Capture the current selection for later restore (undo-reselect). */
	snapshot(): SelectionSnapshot {
		return {
			ids: [...this._selection.ids],
			anchorId: this._selection.anchorId,
			primaryId: this._selection.primaryId,
		};
	}

	/** Restore a previously captured selection snapshot. */
	restore(snap: SelectionSnapshot): void {
		this.setSelection({
			ids: new Set(snap.ids),
			anchorId: snap.anchorId,
			primaryId: snap.primaryId,
		});
	}

	private setSelection(next: Selection): void {
		if (
			!this._inspectingWorld &&
			sameSelection(this._selection, next)
		) {
			return;
		}
		this._selection = next;
		this._inspectingWorld = false;
		this._selectionVersion += 1;
		this.notify();
	}
}
