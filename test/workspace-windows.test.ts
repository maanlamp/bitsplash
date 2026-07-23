import { beforeEach, describe, expect, test } from "bun:test";
import {
	allViewIds,
	collapseEmptyWindows,
	defaultWorkspace,
	findView,
	getWindow,
	HUB_WINDOW_ID,
	type LayoutNode,
	mergeWindows,
	moveViewAcrossWindows,
	nextWindowId,
	removeView,
	replaceWindowRoot,
	resetLayoutIds,
	spawnWindowWithView,
	type TabGroupId,
	type Workspace,
} from "../src/editor/workspace/layout";

const hub = (ws: Workspace) => getWindow(ws, HUB_WINDOW_ID)!;

const tabGroupIds = (
	root: LayoutNode,
	acc: TabGroupId[] = [],
): TabGroupId[] => {
	if (root.type === "tabs") {
		acc.push(root.id);
		return acc;
	}
	for (const child of root.children) {
		tabGroupIds(child, acc);
	}
	return acc;
};

const emptyRoot = (root: LayoutNode): LayoutNode => {
	let next = root;
	for (const id of allViewIds(root)) {
		next = removeView(next, id);
	}
	return next;
};

describe("multi-window layout ops", () => {
	beforeEach(() => {
		resetLayoutIds();
	});

	test("defaultWorkspace has one hub window with stable tab ids", () => {
		const ws = defaultWorkspace("scene:main");
		expect(ws.windows).toHaveLength(1);
		expect(ws.windows[0]!.id).toBe(HUB_WINDOW_ID);
		const ids = tabGroupIds(hub(ws).root);
		expect(ids).toEqual(["tg-1", "tg-2", "tg-3", "tg-4", "tg-5"]);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("spawnWindowWithView tears a view into a fresh satellite", () => {
		const ws = defaultWorkspace("scene:main");
		const next = spawnWindowWithView(ws, "inspector", "sat");

		expect(next.windows).toHaveLength(2);
		expect(findView(hub(next).root, "inspector")).toBeNull();
		const sat = getWindow(next, "sat")!;
		expect(sat.root.type).toBe("tabs");
		expect(allViewIds(sat.root)).toEqual(["inspector"]);
		expect(sat.focused).toBe("inspector");
		if (sat.root.type === "tabs") {
			expect(sat.root.id).toBeTruthy();
		}

		expect(next).not.toBe(ws);
		expect(ws.windows).toHaveLength(1);
		expect(findView(hub(ws).root, "inspector")).not.toBeNull();
	});

	test("spawnWindowWithView mints a deterministic window id after reset", () => {
		const ws = defaultWorkspace("scene:main");
		const next = spawnWindowWithView(ws, "inspector", nextWindowId());
		expect(getWindow(next, "win-1")).toBeDefined();
	});

	test("moveViewAcrossWindows docks into the target tab group", () => {
		const ws = spawnWindowWithView(
			defaultWorkspace("scene:main"),
			"inspector",
			"sat",
		);
		const next = moveViewAcrossWindows(ws, "console", {
			windowId: "sat",
			anchorViewId: "inspector",
			zone: "center",
		});

		expect(findView(hub(next).root, "console")).toBeNull();
		const sat = getWindow(next, "sat")!;
		expect(allViewIds(sat.root)).toEqual(["inspector", "console"]);
		expect(sat.focused).toBe("console");
		expect(next).not.toBe(ws);
	});

	test("moveViewAcrossWindows collapses the emptied source satellite", () => {
		const ws = spawnWindowWithView(
			defaultWorkspace("scene:main"),
			"inspector",
			"sat",
		);
		const next = moveViewAcrossWindows(ws, "inspector", {
			windowId: HUB_WINDOW_ID,
			anchorViewId: "console",
			zone: "center",
		});

		expect(next.windows).toHaveLength(1);
		expect(getWindow(next, "sat")).toBeUndefined();
		expect(findView(hub(next).root, "inspector")).not.toBeNull();
	});

	test("mergeWindows folds a satellite into the hub and drops it", () => {
		let ws = spawnWindowWithView(
			defaultWorkspace("scene:main"),
			"inspector",
			"sat",
		);
		ws = moveViewAcrossWindows(ws, "console", {
			windowId: "sat",
			anchorViewId: "inspector",
			zone: "center",
		});
		const next = mergeWindows(ws, "sat", HUB_WINDOW_ID);

		expect(next.windows).toHaveLength(1);
		expect(getWindow(next, "sat")).toBeUndefined();
		expect(findView(hub(next).root, "inspector")).not.toBeNull();
		expect(findView(hub(next).root, "console")).not.toBeNull();
	});

	test("mergeWindows refuses to merge the hub away", () => {
		const ws = spawnWindowWithView(
			defaultWorkspace("scene:main"),
			"inspector",
			"sat",
		);
		expect(mergeWindows(ws, HUB_WINDOW_ID, "sat")).toBe(ws);
	});

	test("collapseEmptyWindows drops empty satellites but never the hub", () => {
		const spawned = spawnWindowWithView(
			defaultWorkspace("scene:main"),
			"inspector",
			"sat",
		);
		const emptied: Workspace = {
			...spawned,
			windows: spawned.windows.map((window) => ({
				...window,
				root: emptyRoot(window.root),
			})),
		};
		const next = collapseEmptyWindows(emptied);

		expect(next.windows).toHaveLength(1);
		expect(next.windows[0]!.id).toBe(HUB_WINDOW_ID);
		expect(allViewIds(next.windows[0]!.root)).toEqual([]);
	});

	test("removing a window's focused view refocuses window-locally", () => {
		// Hub focuses the inspector; a satellite holds console. Removing the
		// inspector from the hub must refocus within the hub (never jump to the
		// satellite's view), and must leave the satellite untouched.
		let ws = spawnWindowWithView(
			defaultWorkspace("scene:main"),
			"console",
			"sat",
		);
		ws = replaceWindowRoot(
			{
				...ws,
				windows: ws.windows.map((w) =>
					w.id === HUB_WINDOW_ID ? { ...w, focused: "inspector" } : w,
				),
			},
			HUB_WINDOW_ID,
			removeView(hub(ws).root, "inspector"),
		);

		const hubFocus = hub(ws).focused;
		expect(hubFocus).not.toBeNull();
		expect(findView(hub(ws).root, hubFocus!)).not.toBeNull();
		expect(getWindow(ws, "sat")!.focused).toBe("console");
	});

	test("existing tab-group ids survive a cross-window move", () => {
		const ws = defaultWorkspace("scene:main");
		const treeGroup = tabGroupIds(hub(ws).root)[0];
		const next = spawnWindowWithView(ws, "inspector", "sat");
		expect(tabGroupIds(hub(next).root)[0]).toBe(treeGroup!);
	});
});
