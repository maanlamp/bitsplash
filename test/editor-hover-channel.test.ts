import { describe, expect, test } from "bun:test";
import { EditorState } from "../src/editor/editor-state";
import type { EntityId } from "../src/engine/ecs";

const entity = (name: string): EntityId => name as unknown as EntityId;

describe("editor hover notification channel", () => {
	test("setHovered wakes only the hover channel, never the coarse store channel", () => {
		const store = new EditorState();
		let coarse = 0;
		let hover = 0;
		store.subscribe(() => coarse++);
		store.subscribeHover(() => hover++);

		store.setHovered(entity("a"));
		expect(hover).toBe(1);
		// The regression this guards: a hover change must not force the app shell
		// or project-tree root (coarse subscribers) to re-render, which froze the
		// view on every entity the cursor crossed.
		expect(coarse).toBe(0);

		store.setHovered(entity("a"));
		expect(hover).toBe(1);

		store.setHovered(null);
		expect(hover).toBe(2);
		expect(coarse).toBe(0);
	});

	test("selection changes still notify the coarse store channel", () => {
		const store = new EditorState();
		let coarse = 0;
		let hover = 0;
		store.subscribe(() => coarse++);
		store.subscribeHover(() => hover++);

		store.selectOne(entity("a"));
		expect(coarse).toBe(1);
		expect(hover).toBe(0);
	});
});
