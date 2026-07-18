import type { ECS } from "../engine/ecs";
import type { ActiveScene } from "./active-scene";
import type { EditorState, Selection } from "./editor-state";
import type { SceneDocument } from "./scene-document";
import { Subscribable } from "./subscribable";

/**
 * The per-scene editing context a scene id resolves to: its selection store,
 * its edit document, and the ECS whose ids that selection refers to.
 */
export type SelectionContext = Readonly<{
	store: EditorState;
	document: SceneDocument;
	ecs: ECS;
}>;

/**
 * The channel payload the inspector consumes. Ids are meaningless without their
 * owning world, so the selection always travels with its `document` and `ecs`
 * (plan shared contract: selection channel payload).
 */
export type SelectionChannelPayload = Readonly<{
	selection: Selection;
	document: SceneDocument;
	ecs: ECS;
}>;

/**
 * A derived {@link Subscribable} that mirrors the active scene's selection to a
 * single subscriber surface (the inspector) as `{ selection, document, ecs }`
 * (plan A3). It re-emits once per change: it follows the {@link ActiveScene}
 * pointer, resubscribing to whichever scene's {@link EditorState} is active, so
 * a selection change in the focused scene — and only the focused scene —
 * propagates.
 */
export class SelectionChannel extends Subscribable {
	private _snapshot: SelectionChannelPayload | null = null;
	private storeUnsub: (() => void) | null = null;
	private readonly activeUnsub: () => void;

	constructor(
		private readonly active: ActiveScene,
		private readonly resolve: (
			sceneId: string,
		) => SelectionContext | null,
	) {
		super();
		this.activeUnsub = active.subscribe(() => this.rebind());
		this.rebind();
	}

	/** The current payload, or `null` when no scene is active. A stable
	 * reference between emissions. */
	get snapshot(): SelectionChannelPayload | null {
		return this._snapshot;
	}

	dispose(): void {
		this.storeUnsub?.();
		this.storeUnsub = null;
		this.activeUnsub();
	}

	private rebind(): void {
		this.storeUnsub?.();
		this.storeUnsub = null;
		const id = this.active.sceneId;
		const ctx = id ? this.resolve(id) : null;
		if (ctx) {
			this.storeUnsub = ctx.store.subscribe(() =>
				this.recompute(ctx),
			);
		}
		this.recompute(ctx);
	}

	private recompute(ctx: SelectionContext | null): void {
		const next: SelectionChannelPayload | null = ctx
			? {
					selection: ctx.store.selection,
					document: ctx.document,
					ecs: ctx.ecs,
				}
			: null;
		if (sameSnapshot(this._snapshot, next)) {
			return;
		}
		this._snapshot = next;
		this.notify();
	}
}

/**
 * Whether two payloads are equal by reference in each field. `selection` is a
 * stable reference that changes only on a real selection change, so this lets
 * the channel stay quiet through the store's hover/mode churn — the inspector
 * re-renders only when the selection (or its owning world) actually changes.
 */
const sameSnapshot = (
	a: SelectionChannelPayload | null,
	b: SelectionChannelPayload | null,
): boolean => {
	if (a === b) {
		return true;
	}
	if (a === null || b === null) {
		return false;
	}
	return (
		a.selection === b.selection &&
		a.document === b.document &&
		a.ecs === b.ecs
	);
};
