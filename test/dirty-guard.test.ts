import { beforeEach, describe, expect, test } from "bun:test";
import { dirtyDocumentsForClose } from "../src/editor/workspace/dirty-guard";
import {
	defaultWorkspace,
	findView,
	getWindow,
	HUB_WINDOW_ID,
	insertView,
	type LayoutNode,
	resetLayoutIds,
	spawnWindowWithView,
	updateWindow,
	type ViewId,
} from "../src/editor/workspace/layout";

const addBeside = (
	root: LayoutNode,
	anchor: ViewId,
	id: ViewId,
): LayoutNode =>
	insertView(root, id, findView(root, anchor)!, "center");

describe("dirtyDocumentsForClose (document-unit dirty resolution)", () => {
	beforeEach(() => {
		resetLayoutIds();
	});

	test("a satellite close lists only that window's dirty documents", () => {
		// Hub holds scene:main + a dirty sprite; a satellite holds a dirty scene.
		let ws = defaultWorkspace("scene:main");
		ws = updateWindow(ws, HUB_WINDOW_ID, (w) => ({
			...w,
			root: addBeside(w.root, "scene:main", "sprite:hero"),
		}));
		ws = spawnWindowWithView(ws, "scene:main", "sat");
		const dirty = new Set(["sprite:hero", "scene:main"]);
		const isDirty = (id: ViewId) => dirty.has(id);

		expect(dirtyDocumentsForClose(ws, "sat", isDirty)).toEqual([
			"scene:main",
		]);
	});

	test("closing the hub aggregates dirty documents across every window (app quit)", () => {
		let ws = defaultWorkspace("scene:main");
		ws = updateWindow(ws, HUB_WINDOW_ID, (w) => ({
			...w,
			root: addBeside(w.root, "scene:main", "sprite:hero"),
		}));
		ws = spawnWindowWithView(ws, "scene:main", "sat");
		const dirty = new Set(["sprite:hero", "scene:main"]);
		const isDirty = (id: ViewId) => dirty.has(id);

		const result = dirtyDocumentsForClose(ws, HUB_WINDOW_ID, isDirty);
		expect([...result].sort()).toEqual(["scene:main", "sprite:hero"]);
	});

	test("no dirty documents yields an empty list (close proceeds silently)", () => {
		const ws = defaultWorkspace("scene:main");
		expect(
			dirtyDocumentsForClose(ws, HUB_WINDOW_ID, () => false),
		).toEqual([]);
	});

	test("a clean window with a dirty sibling window reports nothing on its own close", () => {
		let ws = defaultWorkspace("scene:main");
		ws = spawnWindowWithView(ws, "inspector", "sat");
		// Only the hub's scene is dirty; closing the (clean) satellite prompts nothing.
		const isDirty = (id: ViewId) => id === "scene:main";
		expect(getWindow(ws, "sat")).toBeDefined();
		expect(dirtyDocumentsForClose(ws, "sat", isDirty)).toEqual([]);
	});
});
