import {
	contains,
	dockZone,
	type Rect,
	zoneRect,
} from "./dock-zones";
import type { DockZone, ViewId, WindowId } from "./layout";

/** A pointer position, or a window content origin, in screen-space DIPs. */
export type Point = Readonly<{ x: number; y: number }>;

/** A window's content rectangle in screen-space DIPs (from the main process). */
export type ContentBounds = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
}>;

/**
 * One tab group's geometry, tagged with its window. All rectangles are in the
 * same coordinate space — either a single window's client space, or screen-space
 * DIPs after {@link toScreenLeaf}.
 */
export type LeafInfo = Readonly<{
	windowId: WindowId;
	anchor: ViewId;
	rect: Rect;
	stripRect: Rect;
	contentRect: Rect;
	tabs: ReadonlyArray<{ id: ViewId; rect: Rect }>;
}>;

/**
 * The resolved drop under the cursor. `reorder` moves the dragged tab within its
 * origin group at `order`; `dock` docks it into `anchor`'s group at `zone`
 * (`center` = same tab strip). `rect` is the highlight rectangle to paint (in
 * the coordinate space the leaves were given in).
 */
export type DropTarget =
	| Readonly<{
			mode: "reorder";
			windowId: WindowId;
			anchor: ViewId;
			order: ReadonlyArray<ViewId>;
	  }>
	| Readonly<{
			mode: "dock";
			windowId: WindowId;
			anchor: ViewId;
			zone: DockZone;
			rect: Rect;
	  }>;

/** Convert a client-space rect (zoomed CSS px) into a screen-space DIP rect. */
export const clientRectToScreen = (
	client: Rect,
	bounds: ContentBounds,
	zoom: number,
): Rect => ({
	left: bounds.x + client.left * zoom,
	top: bounds.y + client.top * zoom,
	width: client.width * zoom,
	height: client.height * zoom,
});

/** Convert every rect of a client-space leaf into screen-space DIPs. */
export const toScreenLeaf = (
	leaf: LeafInfo,
	bounds: ContentBounds,
	zoom: number,
): LeafInfo => ({
	windowId: leaf.windowId,
	anchor: leaf.anchor,
	rect: clientRectToScreen(leaf.rect, bounds, zoom),
	stripRect: clientRectToScreen(leaf.stripRect, bounds, zoom),
	contentRect: clientRectToScreen(leaf.contentRect, bounds, zoom),
	tabs: leaf.tabs.map((tab) => ({
		id: tab.id,
		rect: clientRectToScreen(tab.rect, bounds, zoom),
	})),
});

const anchorFor = (leaf: LeafInfo, dragged: ViewId): ViewId =>
	leaf.tabs.find((tab) => tab.id !== dragged)?.id ?? leaf.anchor;

const reorderOrder = (
	leaf: LeafInfo,
	dragged: ViewId,
	x: number,
): ReadonlyArray<ViewId> => {
	const others = leaf.tabs.filter((tab) => tab.id !== dragged);
	let index = others.length;
	for (let i = 0; i < others.length; i++) {
		const center = others[i]!.rect.left + others[i]!.rect.width / 2;
		if (x < center) {
			index = i;
			break;
		}
	}
	const order = others.map((tab) => tab.id);
	order.splice(index, 0, dragged);
	return order;
};

/**
 * Pick the topmost leaf whose bounds contain the cursor. Leaves within one
 * window never overlap, but windows can, so ties are broken by `focusOrder`
 * (front = topmost); leaves whose window is not in `focusOrder` sort last.
 */
const leafUnder = (
	leaves: ReadonlyArray<LeafInfo>,
	x: number,
	y: number,
	focusOrder: ReadonlyArray<WindowId>,
): LeafInfo | null => {
	const rank = (windowId: WindowId): number => {
		const at = focusOrder.indexOf(windowId);
		return at < 0 ? focusOrder.length : at;
	};
	let best: LeafInfo | null = null;
	for (const leaf of leaves) {
		if (!contains(leaf.rect, x, y)) {
			continue;
		}
		if (!best || rank(leaf.windowId) < rank(best.windowId)) {
			best = leaf;
		}
	}
	return best;
};

/**
 * Resolve the drop target for a tab drag. `leaves` and `cursor` must share one
 * coordinate space (screen-space DIPs for a cross-window drag). Returns `null`
 * when the cursor is over empty desktop (the caller spawns a window), or when a
 * center-drop onto the dragged tab's own leaf would be a no-op.
 */
export const resolveDropTarget = (
	leaves: ReadonlyArray<LeafInfo>,
	dragged: ViewId,
	cursor: Point,
	focusOrder: ReadonlyArray<WindowId>,
): DropTarget | null => {
	const { x, y } = cursor;
	const leaf = leafUnder(leaves, x, y, focusOrder);
	if (!leaf) {
		return null;
	}
	const isOrigin = leaf.tabs.some((tab) => tab.id === dragged);
	if (contains(leaf.stripRect, x, y)) {
		if (isOrigin) {
			return {
				mode: "reorder",
				windowId: leaf.windowId,
				anchor: leaf.anchor,
				order: reorderOrder(leaf, dragged, x),
			};
		}
		return {
			mode: "dock",
			windowId: leaf.windowId,
			anchor: anchorFor(leaf, dragged),
			zone: "center",
			rect: leaf.contentRect,
		};
	}
	const zone = dockZone(leaf.contentRect, x, y);
	if (isOrigin && zone === "center" && leaf.tabs.length === 1) {
		return null;
	}
	if (zone === "center") {
		return {
			mode: "dock",
			windowId: leaf.windowId,
			anchor: anchorFor(leaf, dragged),
			zone: "center",
			rect: leaf.contentRect,
		};
	}
	return {
		mode: "dock",
		windowId: leaf.windowId,
		anchor: anchorFor(leaf, dragged),
		zone,
		rect: zoneRect(leaf.contentRect, zone),
	};
};
