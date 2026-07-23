import {
	allViewIds,
	pruneViews,
	type TabGroupId,
	type ViewId,
	type WindowId,
	type WindowLayout,
} from "./layout";

/** Screen-space window rectangle carried by a closed-window record. */
export type WindowBounds = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
}>;

/**
 * A single closed tab. Reopening it walks the fallback chain
 * `tabGroupId → windowId → invoking window` (the invoking window is supplied by
 * the caller at reopen time, not stored here).
 */
export type ClosedViewRecord = Readonly<{
	kind: "view";
	viewId: ViewId;
	tabGroupId: TabGroupId;
	windowId: WindowId;
}>;

/**
 * A whole closed window. Resurrecting it restores its bounds, layout tree, and
 * views. Materialization prunes views that have since died or reopened.
 */
export type ClosedWindowRecord = Readonly<{
	kind: "window";
	bounds: WindowBounds;
	layout: WindowLayout;
	views: ReadonlyArray<ViewId>;
}>;

export type ClosedRecord = ClosedViewRecord | ClosedWindowRecord;

/** Predicate over a view id (e.g. "is this view open anywhere / still valid"). */
export type ViewPredicate = (viewId: ViewId) => boolean;

/**
 * Result of a successful {@link ClosedStack.materialize}: the pruned record to
 * reopen plus the stack with that record (and any empty ones skipped over it)
 * removed.
 */
export type Materialization = Readonly<{
	record: ClosedRecord;
	next: ClosedStack;
}>;

const pruneRecord = (
	record: ClosedRecord,
	keep: ViewPredicate,
): ClosedRecord | null => {
	if (record.kind === "view") {
		return keep(record.viewId) ? record : null;
	}
	const root = pruneViews(record.layout.root, keep);
	const views = allViewIds(root);
	if (views.length === 0) {
		return null;
	}
	return {
		...record,
		layout: { ...record.layout, root },
		views,
	};
};

/**
 * Immutable stack of closed-view/closed-window records backing the editor's
 * reopen (mod+shift+t) affordance. Every mutation returns a new stack; the
 * side-effects of actually reopening a record live in the shell, not here.
 *
 * @example
 * let stack = new ClosedStack().pushView("sprite:a", "tg-1", "hub");
 * const result = stack.materialize(isOpen, isValid);
 * if (result) {
 *   reopen(result.record);
 *   stack = result.next;
 * }
 */
export class ClosedStack {
	private readonly records: ReadonlyArray<ClosedRecord>;

	constructor(records: ReadonlyArray<ClosedRecord> = []) {
		this.records = records;
	}

	/** Number of records currently on the stack. */
	get size(): number {
		return this.records.length;
	}

	/** Push a closed-tab record. Returns a new stack. */
	pushView(
		viewId: ViewId,
		tabGroupId: TabGroupId,
		windowId: WindowId,
	): ClosedStack {
		return new ClosedStack([
			...this.records,
			{ kind: "view", viewId, tabGroupId, windowId },
		]);
	}

	/** Push a closed-window record. Returns a new stack. */
	pushWindow(
		bounds: WindowBounds,
		layout: WindowLayout,
	): ClosedStack {
		return new ClosedStack([
			...this.records,
			{
				kind: "window",
				bounds,
				layout,
				views: allViewIds(layout.root),
			},
		]);
	}

	/**
	 * Pop the most recent record that still has something to reopen. A view is
	 * dropped from a record when it is invalid (dead) or already open in any
	 * window (`isOpen` wins). Records left empty after pruning are discarded and
	 * the next entry is tried. Returns `null` when nothing remains to reopen.
	 */
	materialize(
		isOpen: ViewPredicate,
		isValid: ViewPredicate,
	): Materialization | null {
		const keep: ViewPredicate = (viewId) =>
			isValid(viewId) && !isOpen(viewId);
		let records = this.records;
		while (records.length > 0) {
			const record = records[records.length - 1]!;
			const rest = records.slice(0, -1);
			const pruned = pruneRecord(record, keep);
			if (pruned) {
				return { record: pruned, next: new ClosedStack(rest) };
			}
			records = rest;
		}
		return null;
	}
}
