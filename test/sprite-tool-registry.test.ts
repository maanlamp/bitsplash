import { describe, expect, test } from "bun:test";
import { SPRITE_TOOL_IDS } from "../src/editor/sprite/sprite-tool-id";
import {
	getTool,
	getToolEntry,
	TOOL_REGISTRY,
} from "../src/editor/sprite/tool-registry";

describe("sprite tool registry", () => {
	test("registers exactly the declared ids, in order", () => {
		expect(TOOL_REGISTRY.map((e) => e.id)).toEqual([
			...SPRITE_TOOL_IDS,
		]);
	});

	test("every declared id resolves to an entry whose strategy matches", () => {
		for (const id of SPRITE_TOOL_IDS) {
			const entry = getToolEntry(id);
			expect(entry.id).toBe(id);
			expect(entry.tool.id).toBe(id);
			expect(getTool(id)).toBe(entry.tool);
		}
	});

	test("shortcuts are unique", () => {
		const shortcuts = TOOL_REGISTRY.map((e) => e.shortcut);
		expect(new Set(shortcuts).size).toBe(shortcuts.length);
	});

	test("an unknown id throws rather than returning undefined", () => {
		expect(() =>
			getToolEntry("smudge" as (typeof SPRITE_TOOL_IDS)[number]),
		).toThrow();
	});

	test("pan has no lifecycle or preview; brush and eraser do", () => {
		expect("onDown" in getTool("pan")).toBe(false);
		expect("preview" in getTool("pan")).toBe(false);
		expect("onDown" in getTool("brush")).toBe(true);
		expect("preview" in getTool("brush")).toBe(true);
		expect("onDown" in getTool("eraser")).toBe(true);
	});

	test("cursor differs for pan vs stroke tools", () => {
		expect(getTool("pan").cursor(true)).toBe("grab");
		expect(getTool("brush").cursor(true)).toBe("none");
		expect(getTool("brush").cursor(false)).toBe("default");
	});
});
