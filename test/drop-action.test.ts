import { beforeEach, describe, expect, test } from "bun:test";
import {
	isOnlyTabOfWindow,
	resolveDropAction,
} from "../src/editor/workspace/drop-action";
import type { DropTarget } from "../src/editor/workspace/hit-test";
import {
	defaultWorkspace,
	HUB_WINDOW_ID,
	resetLayoutIds,
	spawnWindowWithView,
	type Workspace,
} from "../src/editor/workspace/layout";

/**
 * Headless coverage for mapping a resolved drop target to the layout op the
 * shell runs (WS-E). Gesture/GL behaviour is validated live; this asserts the
 * pure decision table only.
 */

describe("drop-action resolution", () => {
	let ws: Workspace;
	beforeEach(() => {
		resetLayoutIds();
		ws = defaultWorkspace("scene:main");
	});

	test("null target spawns; only-tab-of-window reuses the source window", () => {
		const withSat = spawnWindowWithView(ws, "inspector", "sat");
		expect(
			resolveDropAction(null, withSat, "inspector", "sat"),
		).toEqual({
			kind: "spawn",
			viewId: "inspector",
			reuseWindowId: "sat",
		});
		// The tree still has other views, so a scene tab is not its window's only tab.
		expect(
			resolveDropAction(null, withSat, "tree", HUB_WINDOW_ID),
		).toEqual({
			kind: "spawn",
			viewId: "tree",
			reuseWindowId: null,
		});
	});

	test("reorder target maps to a reorder action", () => {
		const target: DropTarget = {
			mode: "reorder",
			windowId: HUB_WINDOW_ID,
			anchor: "console",
			order: ["profiler", "console"],
		};
		expect(
			resolveDropAction(target, ws, "console", HUB_WINDOW_ID),
		).toEqual({
			kind: "reorder",
			windowId: HUB_WINDOW_ID,
			anchor: "console",
			order: ["profiler", "console"],
		});
	});

	test("dock in the same window maps to move-in-window", () => {
		const target: DropTarget = {
			mode: "dock",
			windowId: HUB_WINDOW_ID,
			anchor: "tree",
			zone: "bottom",
			rect: { left: 0, top: 0, width: 1, height: 1 },
		};
		expect(
			resolveDropAction(target, ws, "inspector", HUB_WINDOW_ID),
		).toEqual({
			kind: "move-in-window",
			windowId: HUB_WINDOW_ID,
			viewId: "inspector",
			anchor: "tree",
			zone: "bottom",
		});
	});

	test("dock into another window maps to move-across", () => {
		const withSat = spawnWindowWithView(ws, "inspector", "sat");
		const target: DropTarget = {
			mode: "dock",
			windowId: "sat",
			anchor: "inspector",
			zone: "center",
			rect: { left: 0, top: 0, width: 1, height: 1 },
		};
		expect(
			resolveDropAction(target, withSat, "tree", HUB_WINDOW_ID),
		).toEqual({
			kind: "move-across",
			viewId: "tree",
			windowId: "sat",
			anchor: "inspector",
			zone: "center",
		});
	});

	test("center-drop onto the dragged view's own group is a no-op", () => {
		const target: DropTarget = {
			mode: "dock",
			windowId: HUB_WINDOW_ID,
			anchor: "profiler",
			zone: "center",
			rect: { left: 0, top: 0, width: 1, height: 1 },
		};
		// console shares the console/profiler tab group in the default layout.
		expect(
			resolveDropAction(target, ws, "console", HUB_WINDOW_ID),
		).toEqual({ kind: "none" });
	});

	test("isOnlyTabOfWindow is true only for a window's sole view", () => {
		const withSat = spawnWindowWithView(ws, "inspector", "sat");
		expect(isOnlyTabOfWindow(withSat, "inspector")).toBe(true);
		expect(isOnlyTabOfWindow(withSat, "tree")).toBe(false);
		expect(isOnlyTabOfWindow(withSat, "nope")).toBe(false);
	});
});
