import { describe, expect, test } from "bun:test";
import type { Rect } from "../src/editor/workspace/dock-zones";
import {
	clientRectToScreen,
	type LeafInfo,
	resolveDropTarget,
} from "../src/editor/workspace/hit-test";
import type {
	ViewId,
	WindowId,
} from "../src/editor/workspace/layout";

/**
 * Headless coverage for the cross-window tab-drag hit-test math (WS-E). All
 * rectangles here are already in screen-space DIPs; the live gesture converts
 * client rects with {@link clientRectToScreen}, which is exercised separately.
 */

const rect = (
	left: number,
	top: number,
	width: number,
	height: number,
): Rect => ({ left, top, width, height });

const leaf = (
	windowId: WindowId,
	anchor: ViewId,
	origin: Rect,
	stripH: number,
	tabs: ReadonlyArray<{ id: ViewId; rect: Rect }>,
): LeafInfo => ({
	windowId,
	anchor,
	rect: origin,
	stripRect: rect(origin.left, origin.top, origin.width, stripH),
	contentRect: rect(
		origin.left,
		origin.top + stripH,
		origin.width,
		origin.height - stripH,
	),
	tabs,
});

describe("clientRectToScreen", () => {
	test("offsets by content origin and scales by zoom", () => {
		const screen = clientRectToScreen(
			rect(10, 20, 100, 50),
			{ x: 300, y: 400, width: 800, height: 600 },
			2,
		);
		expect(screen).toEqual(rect(320, 440, 200, 100));
	});
});

describe("resolveDropTarget", () => {
	const stripLeaf = leaf("hub", "a", rect(0, 0, 200, 200), 40, [
		{ id: "a", rect: rect(0, 0, 60, 40) },
		{ id: "b", rect: rect(60, 0, 60, 40) },
	]);

	test("reorders within the origin strip by tab center", () => {
		const target = resolveDropTarget(
			[stripLeaf],
			"a",
			{ x: 100, y: 20 },
			["hub"],
		);
		expect(target).toEqual({
			mode: "reorder",
			windowId: "hub",
			anchor: "a",
			order: ["b", "a"],
		});
	});

	test("docks center over a foreign strip", () => {
		const foreign = leaf("sat", "c", rect(0, 0, 200, 200), 40, [
			{ id: "c", rect: rect(0, 0, 60, 40) },
		]);
		const target = resolveDropTarget(
			[foreign],
			"a",
			{ x: 30, y: 20 },
			["sat"],
		);
		expect(target?.mode).toBe("dock");
		if (target?.mode === "dock") {
			expect(target.windowId).toBe("sat");
			expect(target.zone).toBe("center");
			expect(target.anchor).toBe("c");
		}
	});

	test("resolves an edge zone in the content area", () => {
		const target = resolveDropTarget(
			[stripLeaf],
			"z",
			{ x: 5, y: 120 },
			["hub"],
		);
		expect(target?.mode).toBe("dock");
		if (target?.mode === "dock") {
			expect(target.zone).toBe("left");
			expect(target.rect).toEqual(rect(0, 40, 100, 160));
		}
	});

	test("center-drop onto the dragged view's own single-tab leaf is a no-op", () => {
		const target = resolveDropTarget(
			[stripLeaf],
			"a",
			{ x: 100, y: 120 },
			["hub"],
		);
		// The dragged tab shares this leaf (2 tabs), so center still docks; make a
		// dedicated single-tab origin leaf to hit the no-op branch.
		const single = leaf("hub", "a", rect(0, 0, 200, 200), 40, [
			{ id: "a", rect: rect(0, 0, 60, 40) },
		]);
		expect(target?.mode).toBe("dock");
		expect(
			resolveDropTarget([single], "a", { x: 100, y: 120 }, ["hub"]),
		).toBeNull();
	});

	test("empty desktop yields no target", () => {
		expect(
			resolveDropTarget([stripLeaf], "a", { x: 999, y: 999 }, [
				"hub",
			]),
		).toBeNull();
	});

	test("bottom and right zones resolve in the content area", () => {
		const bottom = resolveDropTarget(
			[stripLeaf],
			"z",
			{ x: 100, y: 190 },
			["hub"],
		);
		expect(bottom?.mode).toBe("dock");
		if (bottom?.mode === "dock") {
			expect(bottom.zone).toBe("bottom");
		}
		const right = resolveDropTarget(
			[stripLeaf],
			"z",
			{ x: 190, y: 120 },
			["hub"],
		);
		expect(right?.mode).toBe("dock");
		if (right?.mode === "dock") {
			expect(right.zone).toBe("right");
		}
	});

	// Root cause of the bottom/right regression: the gesture builds screen-space
	// leaves from each window's content bounds, so the hit-test cursor must be
	// expressed against that SAME origin. A cursor measured independently (an
	// Electron `getCursorScreenPoint()` that disagrees with `getContentBounds()`
	// by a title-bar/DPI offset) shifts every hit toward the top-left, making the
	// bottom/right bands unreachable. Deriving the cursor from the captured
	// pointer as `contentOrigin + client × zoom` cancels that offset.
	test("cursor derived from the leaf's own content origin reaches bottom-right", () => {
		const bounds = { x: 300, y: 400, width: 400, height: 400 };
		const zoom = 2;
		const client = rect(0, 0, 200, 200);
		const screen = clientRectToScreen(client, bounds, zoom);
		const leafScreen = leaf("hub", "a", screen, 40 * zoom, [
			{ id: "a", rect: rect(screen.left, screen.top, 60, 40) },
		]);
		// Pointer at 85% across / 90% down the content, in client space.
		const clientX = 170;
		const clientY = 190;
		const consistent = {
			x: bounds.x + clientX * zoom,
			y: bounds.y + clientY * zoom,
		};
		const target = resolveDropTarget([leafScreen], "z", consistent, [
			"hub",
		]);
		expect(target?.mode).toBe("dock");
		if (target?.mode === "dock") {
			expect(["bottom", "right"]).toContain(target.zone);
		}
	});

	test("overlapping windows resolve by focus order (topmost wins)", () => {
		const back = leaf("hub", "a", rect(0, 0, 200, 200), 40, [
			{ id: "a", rect: rect(0, 0, 60, 40) },
		]);
		const front = leaf("sat", "c", rect(0, 0, 200, 200), 40, [
			{ id: "c", rect: rect(0, 0, 60, 40) },
		]);
		const target = resolveDropTarget(
			[back, front],
			"z",
			{ x: 30, y: 20 },
			["sat", "hub"],
		);
		expect(target?.mode).toBe("dock");
		if (target?.mode === "dock") {
			expect(target.windowId).toBe("sat");
		}
	});
});
