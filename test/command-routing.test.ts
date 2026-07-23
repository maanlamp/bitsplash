import { beforeEach, describe, expect, test } from "bun:test";
import { resolveCommandSceneView } from "../src/editor/workspace/command-routing";
import {
	defaultWorkspace,
	findView,
	getWindow,
	HUB_WINDOW_ID,
	insertView,
	type LayoutNode,
	resetLayoutIds,
	spawnWindowWithView,
	type ViewId,
	type WindowLayout,
} from "../src/editor/workspace/layout";

const addBeside = (
	root: LayoutNode,
	anchor: ViewId,
	id: ViewId,
): LayoutNode =>
	insertView(root, id, findView(root, anchor)!, "center");

const hubWindow = (): WindowLayout =>
	getWindow(defaultWorkspace("scene:main"), HUB_WINDOW_ID)!;

describe("resolveCommandSceneView (per-window command routing)", () => {
	beforeEach(() => {
		resetLayoutIds();
	});

	test("falls back to the window's first scene view when nothing pinned", () => {
		expect(resolveCommandSceneView(hubWindow(), null)).toBe(
			"scene:main",
		);
	});

	test("prefers the pinned scene view while it is still present", () => {
		const ws = spawnWindowWithView(
			defaultWorkspace("scene:main"),
			"inspector",
			"sat",
		);
		let hub = getWindow(ws, HUB_WINDOW_ID)!;
		hub = {
			...hub,
			root: addBeside(hub.root, "scene:main", "scene:other"),
		};
		expect(resolveCommandSceneView(hub, "scene:other")).toBe(
			"scene:other",
		);
	});

	test("ignores a stale pin not present in the window", () => {
		expect(resolveCommandSceneView(hubWindow(), "scene:ghost")).toBe(
			"scene:main",
		);
	});

	test("no-ops (null) when the invoking window hosts no scene view", () => {
		const ws = spawnWindowWithView(
			defaultWorkspace("scene:main"),
			"inspector",
			"sat",
		);
		const sat = getWindow(ws, "sat")!;
		expect(resolveCommandSceneView(sat, undefined)).toBeNull();
	});

	test("resolution is window-local: each window resolves its own scene", () => {
		// Hub holds scene:main; a satellite is torn out holding scene:side.
		let ws = defaultWorkspace("scene:main");
		const hub = getWindow(ws, HUB_WINDOW_ID)!;
		ws = {
			...ws,
			windows: [
				{
					...hub,
					root: addBeside(hub.root, "scene:main", "scene:side"),
				},
			],
		};
		ws = spawnWindowWithView(ws, "scene:side", "sat");

		const resolvedHub = resolveCommandSceneView(
			getWindow(ws, HUB_WINDOW_ID)!,
			undefined,
		);
		const resolvedSat = resolveCommandSceneView(
			getWindow(ws, "sat")!,
			undefined,
		);
		expect(resolvedHub).toBe("scene:main");
		expect(resolvedSat).toBe("scene:side");
	});
});
