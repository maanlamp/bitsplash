import { contains, type Rect, toRect } from "./dock-zones";
import type { DropAction } from "./drop-action";
import { resolveDropAction } from "./drop-action";
import {
	type ContentBounds,
	type DropTarget,
	type LeafInfo,
	type Point,
	resolveDropTarget,
	toScreenLeaf,
} from "./hit-test";
import {
	nextWindowId,
	type ViewId,
	type WindowId,
	type Workspace,
} from "./layout";

/** Euclidean distance (DIP) the pointer must travel before a drag engages. */
const DRAG_THRESHOLD_DIP = 8;

/**
 * Grace window after a detach in which returning the pointer to the origin
 * strip re-docks (reverts to reorder) instead of committing the tear-out —
 * Chrome's re-dock hysteresis, keeping an accidental vertical twitch from
 * spawning a window.
 */
const REDOCK_GRACE_MS = 240;

/** A single-round-trip drag snapshot from the main process (screen DIPs). */
export type DragSnapshot = Readonly<{
	cursor: Point;
	zoom: number;
	windows: ReadonlyArray<{ id: WindowId; bounds: ContentBounds }>;
	focusOrder: ReadonlyArray<WindowId>;
}>;

/** The desktop bridge the cross-window gesture needs (Electron preload). */
export type DesktopDragBridge = Readonly<{
	snapshot: () => Promise<DragSnapshot>;
	positionWindow: (
		windowId: WindowId,
		bounds: ContentBounds,
	) => Promise<unknown>;
}>;

/** The owning realm (document + window) of an editor window. */
export type WindowRealm = Readonly<{ doc: Document; win: Window }>;

/** Everything the controller needs from the shell; all app-global. */
export type TabDragConfig = Readonly<{
	getWorkspace: () => Workspace;
	realm: (windowId: WindowId) => WindowRealm | null;
	bridge: DesktopDragBridge | null;
	activate: (windowId: WindowId, viewId: ViewId) => void;
	commit: (action: DropAction) => void;
	prewarm: (viewId: ViewId, destWindowId: WindowId) => void;
	cancelPrewarm: (viewId: ViewId) => void;
	dropClassName: string;
	ghostClassName: string;
}>;

type DragState = {
	viewId: ViewId;
	sourceWindowId: WindowId;
	pointerId: number;
	tabEl: HTMLElement;
	originWin: Window;
	startX: number;
	startY: number;
	lastClientX: number;
	lastClientY: number;
	engaged: boolean;
	detached: boolean;
	detachedAt: number;
	zoom: number;
	snapshot: DragSnapshot | null;
	fetching: boolean;
	ghost: HTMLElement | null;
	ghostDoc: Document | null;
	indicator: HTMLElement | null;
	indicatorDoc: Document | null;
	target: DropTarget | null;
	raf: number;
	prewarmedWindow: WindowId | null;
};

/**
 * Reads a window's tab-group geometry in that window's own client space. The
 * cross-window gesture converts these to screen DIPs with {@link toScreenLeaf}.
 */
const collectLeaves = (
	doc: Document,
	windowId: WindowId,
): ReadonlyArray<LeafInfo> =>
	[...doc.querySelectorAll<HTMLElement>("[data-leaf]")].map((el) => {
		const rect = toRect(el.getBoundingClientRect());
		const stripEl = el.querySelector<HTMLElement>("[data-strip]");
		const stripRect = stripEl
			? toRect(stripEl.getBoundingClientRect())
			: {
					left: rect.left,
					top: rect.top,
					width: rect.width,
					height: 0,
				};
		const tabs = stripEl
			? [...stripEl.querySelectorAll<HTMLElement>("[data-tab]")].map(
					(tab) => ({
						id: tab.dataset.tab ?? "",
						rect: toRect(tab.getBoundingClientRect()),
					}),
				)
			: [];
		return {
			windowId,
			anchor: el.dataset.leaf ?? "",
			rect,
			stripRect,
			contentRect: {
				left: rect.left,
				top: stripRect.top + stripRect.height,
				width: rect.width,
				height: rect.height - stripRect.height,
			},
			tabs,
		};
	});

/**
 * Owns the raw-pointer tab-drag gesture (WS-E) across the shared heap: an 8-DIP
 * engage threshold, in-strip reorder, vertical-escape detach with a re-dock
 * grace, a cursor-attached ghost, live drop highlighting painted into every
 * window, and screen-space cross-window hit-testing driven by the main-process
 * cursor. `motion/react` is no longer involved — a gesture must survive crossing
 * an OS-window boundary, which a library drag cannot hand off.
 *
 * The controller is a single app-global instance. Tabs start a gesture with
 * {@link begin}; visuals subscribe via {@link subscribe} + {@link draggingView}.
 */
export class TabDragController {
	private state: DragState | null = null;
	private listeners = new Set<() => void>();

	constructor(private config: TabDragConfig) {}

	/** Update the injected config (fresh workspace getters, realms) each render. */
	setConfig(config: TabDragConfig): void {
		this.config = config;
	}

	/** The view currently being dragged (engaged past threshold), or `null`. */
	get draggingView(): ViewId | null {
		return this.state?.engaged ? this.state.viewId : null;
	}

	/** Subscribe to drag start/stop; returns an unsubscribe. */
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}

	/**
	 * Begin a potential drag from `event` on `tabEl` (`viewId`'s tab in
	 * `windowId`). Does not engage until the pointer passes the threshold; a
	 * release before then is a plain click, activating the tab. `tabEl` is passed
	 * explicitly because a native event's `currentTarget` is null outside its
	 * dispatch.
	 */
	begin(
		viewId: ViewId,
		windowId: WindowId,
		event: PointerEvent,
		tabEl: HTMLElement,
	): void {
		if (event.button !== 0 || this.state) {
			return;
		}
		const originWin = tabEl.ownerDocument.defaultView ?? window;
		try {
			tabEl.setPointerCapture(event.pointerId);
		} catch {}
		this.state = {
			viewId,
			sourceWindowId: windowId,
			pointerId: event.pointerId,
			tabEl,
			originWin,
			startX: event.clientX,
			startY: event.clientY,
			lastClientX: event.clientX,
			lastClientY: event.clientY,
			engaged: false,
			detached: false,
			detachedAt: 0,
			zoom: 1,
			snapshot: null,
			fetching: false,
			ghost: null,
			ghostDoc: null,
			indicator: null,
			indicatorDoc: null,
			target: null,
			raf: 0,
			prewarmedWindow: null,
		};
		tabEl.addEventListener("pointermove", this.onPointerMove);
		tabEl.addEventListener("pointerup", this.onPointerUp);
		tabEl.addEventListener("lostpointercapture", this.onLost);
		originWin.addEventListener("keydown", this.onKeyDown, true);
		this.refreshSnapshot();
	}

	private refreshSnapshot(): void {
		const state = this.state;
		if (!state || !this.config.bridge || state.fetching) {
			return;
		}
		state.fetching = true;
		void this.config.bridge
			.snapshot()
			.then((snap) => {
				if (this.state === state) {
					state.snapshot = snap;
					state.zoom = snap.zoom || 1;
				}
			})
			.catch(() => {})
			.finally(() => {
				if (this.state === state) {
					state.fetching = false;
				}
			});
	}

	private readonly onPointerMove = (event: PointerEvent): void => {
		const state = this.state;
		if (!state) {
			return;
		}
		state.lastClientX = event.clientX;
		state.lastClientY = event.clientY;
		if (!state.engaged) {
			const dist =
				Math.hypot(
					event.clientX - state.startX,
					event.clientY - state.startY,
				) * state.zoom;
			if (dist < DRAG_THRESHOLD_DIP) {
				return;
			}
			state.engaged = true;
			this.notify();
			this.startLoop();
		}
		this.updateDetachGate(event.clientX, event.clientY);
	};

	/** Origin strip rect in origin-window client coords (or null if gone). */
	private originStripRect(): Rect | null {
		const state = this.state;
		if (!state) {
			return null;
		}
		const strip = state.tabEl.closest<HTMLElement>("[data-strip]");
		return strip ? toRect(strip.getBoundingClientRect()) : null;
	}

	/**
	 * Transition between reorder (inside the origin strip) and detached (free
	 * ghost). Detach requires leaving the strip vertically; a return to the strip
	 * within the grace window re-docks.
	 */
	private updateDetachGate(clientX: number, clientY: number): void {
		const state = this.state;
		if (!state) {
			return;
		}
		const strip = this.originStripRect();
		if (!strip) {
			state.detached = true;
			return;
		}
		const insideStrip = contains(strip, clientX, clientY);
		if (!state.detached) {
			const leftVertically =
				clientY < strip.top || clientY > strip.top + strip.height;
			if (leftVertically) {
				state.detached = true;
				state.detachedAt = performance.now();
			}
		} else if (
			insideStrip &&
			performance.now() - state.detachedAt < REDOCK_GRACE_MS
		) {
			state.detached = false;
		}
	}

	private startLoop(): void {
		const state = this.state;
		if (!state) {
			return;
		}
		const tick = (): void => {
			if (this.state !== state) {
				return;
			}
			this.frame();
			state.raf = state.originWin.requestAnimationFrame(tick);
		};
		state.raf = state.originWin.requestAnimationFrame(tick);
	}

	/** One visual frame: resolve the target, paint ghost + indicator, prewarm. */
	private frame(): void {
		const state = this.state;
		if (!state || !state.engaged) {
			return;
		}
		if (this.config.bridge) {
			this.refreshSnapshot();
		}
		const resolved = state.detached
			? this.resolveDetached()
			: this.resolveReorder();
		state.target = resolved.target;
		this.paintGhost(resolved.ghostDoc, resolved.ghostPoint);
		this.paintIndicator(resolved.target, resolved.indicatorDoc);
		this.maybePrewarm(resolved.target);
	}

	/**
	 * Reorder within the origin group (undetached phase). Always yields a reorder
	 * target — never a spurious spawn — even when the pointer strays outside the
	 * strip horizontally, so an in-strip drag only ever reorders.
	 */
	private resolveReorder(): {
		target: DropTarget | null;
		ghostDoc: Document | null;
		ghostPoint: Point;
		indicatorDoc: Document | null;
	} {
		const state = this.state!;
		const realm = this.config.realm(state.sourceWindowId);
		const doc = realm?.doc ?? state.tabEl.ownerDocument;
		const cursor = { x: state.lastClientX, y: state.lastClientY };
		const leaf = collectLeaves(doc, state.sourceWindowId).find((l) =>
			l.tabs.some((tab) => tab.id === state.viewId),
		);
		if (!leaf) {
			return {
				target: null,
				ghostDoc: doc,
				ghostPoint: cursor,
				indicatorDoc: doc,
			};
		}
		const others = leaf.tabs.filter((tab) => tab.id !== state.viewId);
		let index = others.length;
		for (let i = 0; i < others.length; i++) {
			const center = others[i]!.rect.left + others[i]!.rect.width / 2;
			if (cursor.x < center) {
				index = i;
				break;
			}
		}
		const order = others.map((tab) => tab.id);
		order.splice(index, 0, state.viewId);
		return {
			target: {
				mode: "reorder",
				windowId: state.sourceWindowId,
				anchor: leaf.anchor,
				order,
			},
			ghostDoc: doc,
			ghostPoint: cursor,
			indicatorDoc: doc,
		};
	}

	/** Free-ghost hit-test across all windows in screen DIPs (bridge present). */
	private resolveDetached(): {
		target: DropTarget | null;
		ghostDoc: Document | null;
		ghostPoint: Point;
		indicatorDoc: Document | null;
	} {
		const state = this.state!;
		const snapshot = state.snapshot;
		if (!this.config.bridge || !snapshot) {
			// No desktop bridge (single-window dev/browser): fall back to the
			// origin window's client space over all its leaves.
			const realm = this.config.realm(state.sourceWindowId);
			const doc = realm?.doc ?? state.tabEl.ownerDocument;
			const leaves = collectLeaves(doc, state.sourceWindowId);
			const cursor = { x: state.lastClientX, y: state.lastClientY };
			const target = resolveDropTarget(leaves, state.viewId, cursor, [
				state.sourceWindowId,
			]);
			return {
				target,
				ghostDoc: doc,
				ghostPoint: cursor,
				indicatorDoc: doc,
			};
		}
		const boundsById = new Map(
			snapshot.windows.map((w) => [w.id, w.bounds]),
		);
		const cursor = this.liveScreenCursor(snapshot, boundsById);
		const screenLeaves: LeafInfo[] = [];
		for (const { id, bounds } of snapshot.windows) {
			const realm = this.config.realm(id);
			if (!realm) {
				continue;
			}
			for (const leaf of collectLeaves(realm.doc, id)) {
				screenLeaves.push(toScreenLeaf(leaf, bounds, snapshot.zoom));
			}
		}
		const target = resolveDropTarget(
			screenLeaves,
			state.viewId,
			cursor,
			snapshot.focusOrder,
		);
		// Host the ghost in whichever window currently contains the cursor.
		const hostWindow = snapshot.windows.find((w) =>
			contains(
				{
					left: w.bounds.x,
					top: w.bounds.y,
					width: w.bounds.width,
					height: w.bounds.height,
				},
				cursor.x,
				cursor.y,
			),
		);
		const ghostRealm = hostWindow
			? this.config.realm(hostWindow.id)
			: null;
		const ghostBounds = hostWindow
			? boundsById.get(hostWindow.id)
			: undefined;
		// One unified conversion of the live screen cursor into the host window's
		// own client space places the `position: fixed` ghost accurately in ANY
		// window. For the origin window it algebraically reduces to the raw pointer
		// client coords (the cursor was derived from them), so it still tracks 1:1
		// there; for another window it lands under the cursor without the async
		// snapshot lag that made the ghost trail behind.
		const ghostPoint =
			ghostBounds && ghostRealm
				? {
						x: (cursor.x - ghostBounds.x) / snapshot.zoom,
						y: (cursor.y - ghostBounds.y) / snapshot.zoom,
					}
				: { x: state.lastClientX, y: state.lastClientY };
		const indicatorRealm = target
			? this.config.realm(target.windowId)
			: null;
		return {
			target: target ? this.toClientTarget(target, boundsById) : null,
			ghostDoc: ghostRealm?.doc ?? null,
			ghostPoint,
			indicatorDoc: indicatorRealm?.doc ?? null,
		};
	}

	/**
	 * The authoritative pointer position in screen DIPs, derived from the **live**
	 * captured pointer rather than the async snapshot cursor. Pointer capture keeps
	 * `lastClientX/Y` reported in the origin window's client space for the whole
	 * gesture — valid, and allowed to exceed the window, even while the cursor is
	 * physically over another window — so `originContentOrigin + client × zoom` is
	 * the exact screen position with no IPC round-trip lag.
	 *
	 * Crucially it shares the origin window's `getContentBounds()` with the leaves'
	 * own screen conversion, so any systematic offset between Electron's
	 * `screen.getCursorScreenPoint()` and `getContentBounds()` (title-bar inset,
	 * DPI rounding) cancels out — the offset that otherwise shifts every hit-test
	 * toward the top-left and makes the bottom/right dock zones unreachable. Falls
	 * back to the snapshot cursor only when the origin window's bounds are absent.
	 */
	private liveScreenCursor(
		snapshot: DragSnapshot,
		boundsById: Map<WindowId, ContentBounds>,
	): Point {
		const state = this.state!;
		const origin = boundsById.get(state.sourceWindowId);
		if (!origin) {
			return snapshot.cursor;
		}
		return {
			x: origin.x + state.lastClientX * snapshot.zoom,
			y: origin.y + state.lastClientY * snapshot.zoom,
		};
	}

	/**
	 * Convert a screen-space dock target's highlight rect back into its target
	 * window's client space, so the indicator paints correctly in that window.
	 */
	private toClientTarget(
		target: DropTarget,
		boundsById: Map<WindowId, ContentBounds>,
	): DropTarget {
		if (target.mode !== "dock") {
			return target;
		}
		const bounds = boundsById.get(target.windowId);
		const snapshot = this.state?.snapshot;
		if (!bounds || !snapshot) {
			return target;
		}
		const zoom = snapshot.zoom || 1;
		return {
			...target,
			rect: {
				left: (target.rect.left - bounds.x) / zoom,
				top: (target.rect.top - bounds.y) / zoom,
				width: target.rect.width / zoom,
				height: target.rect.height / zoom,
			},
		};
	}

	private maybePrewarm(target: DropTarget | null): void {
		const state = this.state;
		if (!state) {
			return;
		}
		const destWindow =
			target && target.windowId !== state.sourceWindowId
				? target.windowId
				: null;
		if (destWindow === state.prewarmedWindow) {
			return;
		}
		if (state.prewarmedWindow && !destWindow) {
			this.config.cancelPrewarm(state.viewId);
		}
		if (destWindow) {
			this.config.prewarm(state.viewId, destWindow);
		}
		state.prewarmedWindow = destWindow;
	}

	private paintGhost(doc: Document | null, point: Point): void {
		const state = this.state;
		if (!state || !doc) {
			return;
		}
		if (state.ghostDoc !== doc) {
			state.ghost?.remove();
			const clone = doc.importNode(state.tabEl, true);
			clone.className = `${state.tabEl.className} ${this.config.ghostClassName}`;
			clone.style.position = "fixed";
			clone.style.pointerEvents = "none";
			clone.style.zIndex = "99999";
			clone.style.margin = "0";
			doc.body.appendChild(clone);
			state.ghost = clone;
			state.ghostDoc = doc;
		}
		if (state.ghost) {
			state.ghost.style.left = `${point.x + 8}px`;
			state.ghost.style.top = `${point.y + 8}px`;
		}
	}

	private paintIndicator(
		target: DropTarget | null,
		doc: Document | null,
	): void {
		const state = this.state;
		if (!state) {
			return;
		}
		if (target?.mode !== "dock" || !doc) {
			state.indicator?.remove();
			state.indicator = null;
			state.indicatorDoc = null;
			return;
		}
		if (state.indicatorDoc !== doc) {
			state.indicator?.remove();
			const el = doc.createElement("div");
			el.className = this.config.dropClassName;
			doc.body.appendChild(el);
			state.indicator = el;
			state.indicatorDoc = doc;
		}
		const el = state.indicator!;
		el.style.left = `${target.rect.left}px`;
		el.style.top = `${target.rect.top}px`;
		el.style.width = `${target.rect.width}px`;
		el.style.height = `${target.rect.height}px`;
	}

	private readonly onPointerUp = (): void => {
		const state = this.state;
		if (!state) {
			return;
		}
		if (!state.engaged) {
			this.config.activate(state.sourceWindowId, state.viewId);
			this.cleanup();
			return;
		}
		const action = resolveDropAction(
			state.target,
			this.config.getWorkspace(),
			state.viewId,
			state.sourceWindowId,
		);
		if (action.kind === "spawn") {
			this.commitSpawn(action);
		} else if (action.kind !== "none") {
			this.config.commit(action);
		}
		this.cleanup();
	};

	/**
	 * Commit a spawn-on-drop. A view that is its window's only tab reuses that OS
	 * window (no layout change; the existing window is repositioned to the
	 * cursor). Otherwise a fresh satellite id is minted, its bounds seeded into
	 * the manifest before it opens (so it appears at the cursor sized to the
	 * source leaf, never flashing at a default), then the layout op runs.
	 */
	private commitSpawn(
		action: Extract<DropAction, { kind: "spawn" }>,
	): void {
		const bounds = this.spawnBounds();
		if (action.reuseWindowId) {
			if (bounds) {
				void this.config.bridge?.positionWindow(
					action.reuseWindowId,
					bounds,
				);
			}
			return;
		}
		const windowId = nextWindowId();
		if (bounds) {
			void this.config.bridge?.positionWindow(windowId, bounds);
		}
		this.config.commit({ ...action, windowId });
	}

	/**
	 * Bounds for a spawn-on-drop window: sized to the source leaf and placed at
	 * the cursor (screen DIPs). Falls back to a default when no snapshot exists.
	 */
	private spawnBounds(): ContentBounds | null {
		const state = this.state;
		const snapshot = state?.snapshot;
		if (!state || !snapshot) {
			return null;
		}
		const bounds = new Map(
			snapshot.windows.map((w) => [w.id, w.bounds]),
		);
		const srcBounds = bounds.get(state.sourceWindowId);
		const realm = this.config.realm(state.sourceWindowId);
		let width = 680;
		let height = 520;
		if (realm && srcBounds) {
			const leaf = collectLeaves(
				realm.doc,
				state.sourceWindowId,
			).find((l) => l.tabs.some((t) => t.id === state.viewId));
			if (leaf) {
				width = Math.round(leaf.rect.width * snapshot.zoom);
				height = Math.round(leaf.rect.height * snapshot.zoom);
			}
		}
		const cursor = this.liveScreenCursor(snapshot, bounds);
		return {
			x: Math.round(cursor.x - width / 2),
			y: Math.round(cursor.y - 16),
			width,
			height,
		};
	}

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		if (event.key === "Escape" && this.state) {
			event.preventDefault();
			event.stopPropagation();
			this.cancel();
		}
	};

	private readonly onLost = (): void => {
		// Losing capture mid-drag (window switch, OS interruption) cancels the
		// gesture and snaps home rather than committing a half-resolved drop.
		if (this.state?.engaged) {
			this.cancel();
		} else {
			this.cleanup();
		}
	};

	/** Cancel the drag and snap home — no layout change (Esc, lost capture). */
	private cancel(): void {
		const state = this.state;
		if (state?.prewarmedWindow) {
			this.config.cancelPrewarm(state.viewId);
		}
		this.cleanup();
	}

	private cleanup(): void {
		const state = this.state;
		if (!state) {
			return;
		}
		this.state = null;
		state.originWin.cancelAnimationFrame(state.raf);
		state.tabEl.removeEventListener(
			"pointermove",
			this.onPointerMove,
		);
		state.tabEl.removeEventListener("pointerup", this.onPointerUp);
		state.tabEl.removeEventListener(
			"lostpointercapture",
			this.onLost,
		);
		state.originWin.removeEventListener(
			"keydown",
			this.onKeyDown,
			true,
		);
		try {
			state.tabEl.releasePointerCapture(state.pointerId);
		} catch {}
		state.ghost?.remove();
		state.indicator?.remove();
		this.notify();
	}
}
