import { describe, expect, test } from "bun:test";
import {
	isStructurallyValidViewId,
	isValidViewId,
} from "../src/editor/workspace/view-registry";

/**
 * Boot-restore ordering (plan B4): persisted views are kept at load by their
 * structural validity — independent of any live listing — then pruned against
 * the real asset/scene lists once those resolve. This is the fix for the
 * boot-prune bug where asset views were dropped against an empty initial list.
 */
describe("isStructurallyValidViewId (deferred boot validation)", () => {
	test("keeps singletons", () => {
		for (const id of [
			"tree",
			"inspector",
			"asset-browser",
			"console",
			"profiler",
		]) {
			expect(isStructurallyValidViewId(id)).toBe(true);
		}
	});

	test("keeps a scene view with a param but drops a legacy multi-view id", () => {
		expect(isStructurallyValidViewId("scene:demo")).toBe(true);
		expect(isStructurallyValidViewId("scene:demo#2")).toBe(false);
		expect(isStructurallyValidViewId("scene")).toBe(false);
	});

	test("keeps a real asset view but drops the transient new-asset views", () => {
		expect(
			isStructurallyValidViewId("sprite:/src/game/content/a.png"),
		).toBe(true);
		expect(isStructurallyValidViewId("sprite:new")).toBe(false);
		expect(isStructurallyValidViewId("audio:new")).toBe(false);
	});

	test("an asset view structurally kept at load is pruned by the strict check against an empty list", () => {
		const id = "sprite:/src/game/content/a.png";
		expect(isStructurallyValidViewId(id)).toBe(true);
		expect(isValidViewId(id, [])).toBe(false);
	});
});
