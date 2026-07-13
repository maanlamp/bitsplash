import { expect, test } from "bun:test";
import { FocusNav } from "../src/engine/ui/input/focus-nav";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";

let idCounter = 1;

type Rect = [number, number, number, number];

const cell = (
	id: string,
	rect: Rect,
	extra: Record<string, unknown> = {},
): UiNode => ({
	type: "view",
	props: { focusable: true, id, ...extra },
	children: [],
	id: idCounter++,
	layoutRect: { x: rect[0], y: rect[1], w: rect[2], h: rect[3] },
});

const container = (children: UiNode[]): UiNode => ({
	type: "view",
	props: {},
	children,
	id: idCounter++,
});

const byId = (root: UiNode, id: string): UiNode => {
	if (root.props.id === id) {
		return root;
	}
	for (const child of root.children) {
		const found = tryById(child, id);
		if (found) {
			return found;
		}
	}
	throw new Error(`missing ${id}`);
};

const tryById = (root: UiNode, id: string): UiNode | null => {
	if (root.props.id === id) {
		return root;
	}
	for (const child of root.children) {
		const found = tryById(child, id);
		if (found) {
			return found;
		}
	}
	return null;
};

const grid = (): UiNode =>
	container([
		cell("a", [0, 0, 10, 10]),
		cell("b", [20, 0, 10, 10]),
		cell("c", [40, 0, 10, 10]),
		cell("d", [0, 20, 10, 10]),
		cell("e", [20, 20, 10, 10]),
		cell("f", [40, 20, 10, 10]),
		cell("g", [0, 40, 10, 10]),
		cell("h", [20, 40, 10, 10]),
		cell("i", [40, 40, 10, 10]),
	]);

test("spatial navigation resolves the aligned neighbour in each direction", () => {
	const root = grid();
	const nav = new FocusNav();
	nav.focus(byId(root, "e"));

	expect(nav.resolve(root, "right")).toBe(byId(root, "f"));
	expect(nav.resolve(root, "left")).toBe(byId(root, "d"));
	expect(nav.resolve(root, "up")).toBe(byId(root, "b"));
	expect(nav.resolve(root, "down")).toBe(byId(root, "h"));
});

test("navigation returns null past the edge of the grid", () => {
	const root = grid();
	const nav = new FocusNav();
	nav.focus(byId(root, "c"));
	expect(nav.resolve(root, "right")).toBeNull();
});

test("move updates the focused node", () => {
	const root = grid();
	const nav = new FocusNav();
	nav.focus(byId(root, "a"));
	const moved = nav.move(root, "right");
	expect(moved).toBe(byId(root, "b"));
	expect(nav.focused).toBe(byId(root, "b"));
});

test("explicit neighbour override beats spatial scoring", () => {
	const root = grid();
	const a = byId(root, "a");
	a.props.focusNeighbors = { right: "i" };
	const nav = new FocusNav();
	nav.focus(a);
	expect(nav.resolve(root, "right")).toBe(byId(root, "i"));
});

test("no focus yet selects the first focusable in a direction", () => {
	const root = grid();
	const nav = new FocusNav();
	expect(nav.resolve(root, "right")).toBe(byId(root, "a"));
});

test("focus groups prefer same-group candidates then fall back", () => {
	const root = container([
		cell("a", [0, 0, 10, 10], { focusGroup: "left" }),
		cell("b", [20, 0, 10, 10], { focusGroup: "left" }),
		cell("c", [100, 0, 10, 10], { focusGroup: "right" }),
	]);
	const nav = new FocusNav();
	nav.focus(byId(root, "a"));
	expect(nav.resolve(root, "right")).toBe(byId(root, "b"));
	nav.focus(byId(root, "b"));
	expect(nav.resolve(root, "right")).toBe(byId(root, "c"));
});

test("focus memory restores the last selection in a group", () => {
	const root = container([
		cell("a", [0, 0, 10, 10], { focusGroup: "menu" }),
		cell("b", [20, 0, 10, 10], { focusGroup: "menu" }),
		cell("x", [0, 40, 10, 10], { focusGroup: "other" }),
	]);
	const nav = new FocusNav();
	nav.focus(byId(root, "b"));
	nav.focus(byId(root, "x"));
	expect(nav.restore(root, "menu")).toBe(byId(root, "b"));
	expect(nav.focused).toBe(byId(root, "b"));
});

test("focus trap confines navigation to the trapped subtree", () => {
	const modal = container([
		cell("d", [0, 20, 10, 10]),
		cell("e", [20, 20, 10, 10]),
	]);
	const root = container([cell("top", [20, 0, 10, 10]), modal]);
	const nav = new FocusNav();
	nav.setTrap(modal);
	expect(nav.focused).toBe(byId(root, "d"));

	nav.focus(byId(root, "d"));
	expect(nav.resolve(root, "right")).toBe(byId(root, "e"));
	expect(nav.resolve(root, "up")).toBeNull();

	nav.clearTrap();
	nav.focus(byId(root, "d"));
	expect(nav.resolve(root, "up")).toBe(byId(root, "top"));
});
