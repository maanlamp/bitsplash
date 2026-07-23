import { beforeEach, describe, expect, test } from "bun:test";
import {
	defaultWorkspace,
	HUB_WINDOW_ID,
	removeView,
	replaceWindowRoot,
	resetLayoutIds,
	spawnWindowWithView,
} from "../src/editor/workspace/layout";
import { viewBarState } from "../src/editor/workspace/view-bar-state";

describe("viewBarState (ViewBar three states)", () => {
	beforeEach(() => {
		resetLayoutIds();
	});

	test("a singleton open in this window is 'here'", () => {
		const ws = defaultWorkspace("scene:main");
		expect(viewBarState(ws, "inspector", HUB_WINDOW_ID)).toBe("here");
		expect(viewBarState(ws, "tree", HUB_WINDOW_ID)).toBe("here");
	});

	test("a singleton open in another window is 'elsewhere' there and 'here' in its own", () => {
		const ws = spawnWindowWithView(
			defaultWorkspace("scene:main"),
			"inspector",
			"sat",
		);
		expect(viewBarState(ws, "inspector", HUB_WINDOW_ID)).toBe(
			"elsewhere",
		);
		expect(viewBarState(ws, "inspector", "sat")).toBe("here");
	});

	test("a singleton open nowhere is 'closed' in every window", () => {
		let ws = defaultWorkspace("scene:main");
		const hub = ws.windows[0]!;
		ws = replaceWindowRoot(
			ws,
			HUB_WINDOW_ID,
			removeView(hub.root, "tree"),
		);
		expect(viewBarState(ws, "tree", HUB_WINDOW_ID)).toBe("closed");
	});
});
