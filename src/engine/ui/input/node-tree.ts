import type { UiNode } from "../reconciler/ui-node";
import type { Style } from "../style/style";
import type { FocusDirection } from "./ui-event";

export type NodeRect = { x: number; y: number; w: number; h: number };

export const rectContains = (
	rect: NodeRect,
	x: number,
	y: number,
): boolean =>
	x >= rect.x &&
	x < rect.x + rect.w &&
	y >= rect.y &&
	y < rect.y + rect.h;

export const isFocusable = (node: UiNode): boolean =>
	node.props.focusable === true;

export const clips = (node: UiNode): boolean =>
	(node.props.style as Style | undefined)?.overflow === "hidden";

export const pointerEventsOf = (
	node: UiNode,
): "auto" | "none" | undefined => {
	if (typeof node.props.worldLayer === "string") {
		return "none";
	}
	return (node.props.style as Style | undefined)?.pointerEvents;
};

export const focusGroupOf = (node: UiNode): string | null => {
	const group = node.props.focusGroup;
	return typeof group === "string" ? group : null;
};

export const nodeStringId = (node: UiNode): string | null => {
	const id = node.props.id;
	return typeof id === "string" ? id : null;
};

export const focusNeighborsOf = (
	node: UiNode,
): Partial<Record<FocusDirection, string>> | null => {
	const neighbors = node.props.focusNeighbors;
	if (neighbors && typeof neighbors === "object") {
		return neighbors as Partial<Record<FocusDirection, string>>;
	}
	return null;
};

export type UiHandler = (event: unknown) => unknown;

export const handlerOf = (
	node: UiNode,
	name: string,
): UiHandler | null => {
	const handler = node.props[name];
	return typeof handler === "function"
		? (handler as UiHandler)
		: null;
};

const searchPath = (
	node: UiNode,
	target: UiNode,
	path: UiNode[],
): boolean => {
	path.push(node);
	if (node === target) {
		return true;
	}
	for (const child of node.children) {
		if (searchPath(child, target, path)) {
			return true;
		}
	}
	path.pop();
	return false;
};

export const buildPath = (root: UiNode, target: UiNode): UiNode[] => {
	const path: UiNode[] = [];
	return searchPath(root, target, path) ? path : [];
};

/**
 * The deepest node containing both `a` and `b`, or `null` if either is not in
 * the tree.
 *
 * A click is press and release taken together, and the two rarely land on the
 * exact same node: pressing a button's label and releasing a pixel later on its
 * padding is one click on the button, not two hits on nothing. Dispatching to
 * what they have in common is what makes that press count.
 */
export const commonAncestor = (
	root: UiNode,
	a: UiNode,
	b: UiNode,
): UiNode | null => {
	const pathA = buildPath(root, a);
	const pathB = buildPath(root, b);
	let common: UiNode | null = null;
	for (let i = 0; i < pathA.length && i < pathB.length; i++) {
		if (pathA[i] !== pathB[i]) {
			break;
		}
		common = pathA[i]!;
	}
	return common;
};

const walkFocusables = (node: UiNode, out: UiNode[]): void => {
	if (isFocusable(node) && node.layoutRect) {
		out.push(node);
	}
	for (const child of node.children) {
		walkFocusables(child, out);
	}
};

export const collectFocusables = (
	root: UiNode,
	within: UiNode | null,
): UiNode[] => {
	const out: UiNode[] = [];
	walkFocusables(within ?? root, out);
	return out;
};

export const findById = (root: UiNode, id: string): UiNode | null => {
	if (nodeStringId(root) === id) {
		return root;
	}
	for (const child of root.children) {
		const found = findById(child, id);
		if (found) {
			return found;
		}
	}
	return null;
};

export const nearestFocusable = (
	root: UiNode,
	target: UiNode,
): UiNode | null => {
	const path = buildPath(root, target);
	for (let i = path.length - 1; i >= 0; i--) {
		const node = path[i]!;
		if (isFocusable(node)) {
			return node;
		}
	}
	return null;
};
