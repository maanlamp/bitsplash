import { expect, test } from "bun:test";
import { DynStore } from "../src/engine/ui/bypass/dyn-store";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";
import type { Style } from "../src/engine/ui/style/style";

const node = (id: number): UiNode => ({
	type: "view",
	props: {},
	children: [],
	id,
});

test("set merges into an existing entry", () => {
	const store = new DynStore();
	store.set(1, { alpha: 0.5 });
	store.set(1, { offsetX: 10 });
	expect(store.get(1)).toEqual({ alpha: 0.5, offsetX: 10 });
});

test("setField writes a single key without a prior entry", () => {
	const store = new DynStore();
	store.setField(2, "rotation", 1.5);
	expect(store.get(2)?.rotation).toBe(1.5);
});

test("entries are disjoint across node ids", () => {
	const store = new DynStore();
	store.set(1, { alpha: 0.2 });
	store.set(2, { alpha: 0.9 });
	store.clear(1);
	expect(store.get(1)).toBeUndefined();
	expect(store.get(2)?.alpha).toBe(0.9);
});

test("merged alpha prefers dyn then style then 1", () => {
	const store = new DynStore();
	const style: Style = { alpha: 0.4 };
	expect(store.alpha(node(1), style)).toBe(0.4);
	expect(store.alpha(node(2), undefined)).toBe(1);
	store.set(1, { alpha: 0.1 });
	expect(store.alpha(node(1), style)).toBe(0.1);
});

test("merged readers fall back to layout and defaults", () => {
	const store = new DynStore();
	const n = node(3);
	expect(store.offsetX(n)).toBe(0);
	expect(store.offsetY(n)).toBe(0);
	expect(store.rotation(n)).toBe(0);
	expect(store.isVisible(n)).toBe(true);
	expect(store.width(n, 32)).toBe(32);
	expect(store.height(n, 16)).toBe(16);
	store.set(3, { width: 8, visible: false });
	expect(store.width(n, 32)).toBe(8);
	expect(store.isVisible(n)).toBe(false);
});

test("merged color prefers dyn then style", () => {
	const store = new DynStore();
	const style: Style = { color: "#111", backgroundColor: "#222" };
	const n = node(4);
	expect(store.color(n, style)).toBe("#111");
	expect(store.backgroundColor(n, style)).toBe("#222");
	store.set(4, { color: "#999" });
	expect(store.color(n, style)).toBe("#999");
});
