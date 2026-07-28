import type { UiNode } from "../reconciler/ui-node";
import {
	collectFocusables,
	findById,
	focusGroupOf,
	focusNeighborsOf,
	isFocusable,
	nodeStringId,
} from "./node-tree";
import type { FocusDirection } from "./ui-event";

const ORTHOGONAL_WEIGHT_LEFT_RIGHT = 30;
const ORTHOGONAL_WEIGHT_UP_DOWN = 2;

const RE_RESOLVE_ORDER: readonly FocusDirection[] = [
	"down",
	"up",
	"right",
	"left",
];

type Edges = {
	left: number;
	top: number;
	right: number;
	bottom: number;
};

const edgesOf = (node: UiNode): Edges | null => {
	const rect = node.layoutRect;
	if (!rect) {
		return null;
	}
	return {
		left: rect.x,
		top: rect.y,
		right: rect.x + rect.w,
		bottom: rect.y + rect.h,
	};
};

const centerX = (edges: Edges): number =>
	(edges.left + edges.right) / 2;

const centerY = (edges: Edges): number =>
	(edges.top + edges.bottom) / 2;

const inDirection = (
	direction: FocusDirection,
	from: Edges,
	to: Edges,
): boolean => {
	switch (direction) {
		case "right":
			return centerX(to) > centerX(from);
		case "left":
			return centerX(to) < centerX(from);
		case "down":
			return centerY(to) > centerY(from);
		case "up":
			return centerY(to) < centerY(from);
	}
};

const overlapLength = (
	a0: number,
	a1: number,
	b0: number,
	b1: number,
): number => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

const scoreCandidate = (
	direction: FocusDirection,
	from: Edges,
	to: Edges,
): number => {
	let exitX = 0;
	let exitY = 0;
	let entryX = 0;
	let entryY = 0;

	if (direction === "left" || direction === "right") {
		if (direction === "right") {
			exitX = from.right;
			entryX = to.left > from.right ? to.left : from.right;
		} else {
			exitX = from.left;
			entryX = to.right < from.left ? to.right : from.left;
		}
		if (to.top > from.bottom) {
			exitY = from.bottom;
			entryY = to.top;
		} else if (to.bottom < from.top) {
			exitY = from.top;
			entryY = to.bottom;
		} else {
			exitY = Math.max(from.top, to.top);
			entryY = exitY;
		}
	} else {
		if (direction === "down") {
			exitY = from.bottom;
			entryY = to.top > from.bottom ? to.top : from.bottom;
		} else {
			exitY = from.top;
			entryY = to.bottom < from.top ? to.bottom : from.top;
		}
		if (to.left > from.right) {
			exitX = from.right;
			entryX = to.left;
		} else if (to.right < from.left) {
			exitX = from.left;
			entryX = to.right;
		} else {
			exitX = Math.max(from.left, to.left);
			entryX = exitX;
		}
	}

	const dx = Math.abs(exitX - entryX);
	const dy = Math.abs(exitY - entryY);
	const euclidean = Math.sqrt(dx * dx + dy * dy);

	if (direction === "left" || direction === "right") {
		const primary = dx;
		const orthogonal = ORTHOGONAL_WEIGHT_LEFT_RIGHT * dy;
		const overlap = overlapLength(
			from.top,
			from.bottom,
			to.top,
			to.bottom,
		);
		return euclidean + primary + orthogonal - overlap;
	}
	const primary = dy;
	const orthogonal = ORTHOGONAL_WEIGHT_UP_DOWN * dx;
	const overlap = overlapLength(
		from.left,
		from.right,
		to.left,
		to.right,
	);
	return euclidean + primary + orthogonal - overlap;
};

export class FocusNav {
	focused: UiNode | null = null;

	private trapRoot: UiNode | null = null;
	private readonly memory = new Map<string, string>();

	get trap(): UiNode | null {
		return this.trapRoot;
	}

	focus(node: UiNode | null): UiNode | null {
		const previous = this.focused;
		this.focused = node;
		if (node) {
			const group = focusGroupOf(node);
			const id = nodeStringId(node);
			if (group && id) {
				this.memory.set(group, id);
			}
		}
		return previous;
	}

	resolve(root: UiNode, direction: FocusDirection): UiNode | null {
		const current = this.focused;
		if (!current) {
			const list = collectFocusables(root, this.trapRoot);
			return list.length ? list[0]! : null;
		}

		const neighbors = focusNeighborsOf(current);
		const override = neighbors ? neighbors[direction] : undefined;
		if (override) {
			const target = findById(this.trapRoot ?? root, override);
			if (target && isFocusable(target)) {
				return target;
			}
		}

		const from = edgesOf(current);
		if (!from) {
			return null;
		}

		const candidates = collectFocusables(root, this.trapRoot).filter(
			(node) => node !== current,
		);

		const group = focusGroupOf(current);
		if (group) {
			const grouped = candidates.filter(
				(node) => focusGroupOf(node) === group,
			);
			const best = this.bestCandidate(direction, from, grouped);
			if (best) {
				return best;
			}
		}

		return this.bestCandidate(direction, from, candidates);
	}

	/**
	 * Re-points focus after `node` has left the tree. Focus never lingers on a
	 * detached node: it moves to the nearest remaining chain neighbour — an
	 * explicit `focusNeighbors` target first, then the best geometric candidate
	 * from the departing node's last known position, then the first focusable
	 * left standing.
	 *
	 * Call with `node` already detached from `root` but still carrying its
	 * `layoutRect`. Returns the node focus landed on, or `null` when `node` did
	 * not hold focus or nothing focusable remains.
	 */
	nodeRemoved(root: UiNode, node: UiNode): UiNode | null {
		if (this.focused !== node) {
			return null;
		}
		const replacement = this.replacementFor(root, node);
		this.focus(replacement);
		return replacement;
	}

	move(root: UiNode, direction: FocusDirection): UiNode | null {
		const target = this.resolve(root, direction);
		if (target) {
			this.focus(target);
		}
		return target;
	}

	setTrap(node: UiNode): void {
		this.trapRoot = node;
		const focusables = collectFocusables(node, node);
		if (!this.focused || !focusables.includes(this.focused)) {
			this.focus(focusables.length ? focusables[0]! : null);
		}
	}

	clearTrap(): void {
		this.trapRoot = null;
	}

	restore(root: UiNode, group: string): UiNode | null {
		const id = this.memory.get(group);
		if (id) {
			const remembered = findById(this.trapRoot ?? root, id);
			if (remembered && isFocusable(remembered)) {
				this.focus(remembered);
				return remembered;
			}
		}
		const list = collectFocusables(root, this.trapRoot).filter(
			(node) => focusGroupOf(node) === group,
		);
		if (list.length) {
			this.focus(list[0]!);
			return list[0]!;
		}
		return null;
	}

	private replacementFor(root: UiNode, node: UiNode): UiNode | null {
		const neighbors = focusNeighborsOf(node);
		const scope = this.trapRoot ?? root;
		if (neighbors) {
			for (const direction of RE_RESOLVE_ORDER) {
				const id = neighbors[direction];
				const target = id ? findById(scope, id) : null;
				if (target && isFocusable(target) && target.layoutRect) {
					return target;
				}
			}
		}
		const candidates = collectFocusables(root, this.trapRoot).filter(
			(candidate) => candidate !== node,
		);
		const from = edgesOf(node);
		if (from) {
			for (const direction of RE_RESOLVE_ORDER) {
				const best = this.bestCandidate(direction, from, candidates);
				if (best) {
					return best;
				}
			}
		}
		return candidates.length ? candidates[0]! : null;
	}

	private bestCandidate(
		direction: FocusDirection,
		from: Edges,
		candidates: readonly UiNode[],
	): UiNode | null {
		let best: UiNode | null = null;
		let bestScore = Number.POSITIVE_INFINITY;
		for (const candidate of candidates) {
			const to = edgesOf(candidate);
			if (!to || !inDirection(direction, from, to)) {
				continue;
			}
			const score = scoreCandidate(direction, from, to);
			if (score < bestScore) {
				bestScore = score;
				best = candidate;
			}
		}
		return best;
	}
}
