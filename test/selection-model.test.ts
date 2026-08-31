import { describe, expect, test } from "bun:test";
import { EditorState } from "../src/editor/editor-state";
import type { EntityId } from "../src/engine/ecs";

const id = (s: string): EntityId => s as EntityId;
const A = id("a");
const B = id("b");
const C = id("c");
const D = id("d");

describe("selection model (multi-select)", () => {
	test("selectOne makes a single anchor + primary", () => {
		const s = new EditorState();
		s.selectOne(A);
		expect([...s.selection.ids]).toEqual([A]);
		expect(s.primaryId).toBe(A);
		expect(s.anchorId).toBe(A);
		expect(s.has(A)).toBe(true);
		expect(s.selectedCount).toBe(1);
	});

	test("select defaults primary to the last id", () => {
		const s = new EditorState();
		s.select([A, B, C]);
		expect(s.selectedCount).toBe(3);
		expect(s.primaryId).toBe(C);
		expect(s.anchorId).toBe(C);
	});

	test("addToSelection grows the set and re-anchors", () => {
		const s = new EditorState();
		s.select([A, B]);
		s.addToSelection(D);
		expect([...s.selection.ids].toSorted()).toEqual(
			[A, B, D].toSorted(),
		);
		expect(s.primaryId).toBe(D);
		expect(s.anchorId).toBe(D);
	});

	test("toggle removes a member and falls back the primary", () => {
		const s = new EditorState();
		s.select([A, B]);
		s.toggle(B);
		expect(s.has(B)).toBe(false);
		expect(s.has(A)).toBe(true);
		expect(s.primaryId).toBe(A);
	});

	test("toggle adds a non-member as anchor + primary", () => {
		const s = new EditorState();
		s.select([A]);
		s.toggle(B);
		expect(s.has(B)).toBe(true);
		expect(s.primaryId).toBe(B);
		expect(s.anchorId).toBe(B);
	});

	test("selectRange spans anchor to target within the order", () => {
		const s = new EditorState();
		const order = [A, B, C, D];
		s.selectOne(A);
		s.selectRange(C, order);
		expect([...s.selection.ids]).toEqual([A, B, C]);
		expect(s.anchorId).toBe(A);
		expect(s.primaryId).toBe(C);
	});

	test("selectRange works backwards from the anchor", () => {
		const s = new EditorState();
		const order = [A, B, C, D];
		s.selectOne(D);
		s.selectRange(B, order);
		expect([...s.selection.ids]).toEqual([B, C, D]);
		expect(s.primaryId).toBe(B);
	});

	test("clear empties the selection", () => {
		const s = new EditorState();
		s.select([A, B]);
		s.clear();
		expect(s.selectedCount).toBe(0);
		expect(s.primaryId).toBeNull();
	});

	test("selectionVersion bumps on change and is stable on a no-op", () => {
		const s = new EditorState();
		const v0 = s.selectionVersion;
		s.selectOne(A);
		const v1 = s.selectionVersion;
		expect(v1).toBeGreaterThan(v0);
		s.selectOne(A);
		expect(s.selectionVersion).toBe(v1);
	});

	test("the selection value is a stable reference between changes", () => {
		const s = new EditorState();
		s.selectOne(A);
		const first = s.selection;
		s.selectOne(A);
		expect(s.selection).toBe(first);
		s.selectOne(B);
		expect(s.selection).not.toBe(first);
	});

	test("world-inspect and selection are mutually exclusive", () => {
		const s = new EditorState();
		s.selectOne(A);
		s.inspectWorld();
		expect(s.inspectingWorld).toBe(true);
		expect(s.selectedCount).toBe(0);
		s.selectOne(B);
		expect(s.inspectingWorld).toBe(false);
		expect(s.primaryId).toBe(B);
	});
});
