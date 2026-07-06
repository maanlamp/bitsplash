import {
	NavGraph,
	type NavEdge,
	type NavNode,
	nodeFeet,
} from "./nav-graph";

export type NavPathStep = Readonly<{
	node: NavNode;
	edge: NavEdge | null;
}>;

class MinHeap {
	private heap: Array<{ id: number; f: number }> = [];

	get size(): number {
		return this.heap.length;
	}

	push(id: number, f: number): void {
		const heap = this.heap;
		heap.push({ id, f });
		let i = heap.length - 1;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (heap[parent]!.f <= heap[i]!.f) {
				break;
			}
			[heap[parent], heap[i]] = [heap[i]!, heap[parent]!];
			i = parent;
		}
	}

	pop(): number {
		const heap = this.heap;
		const top = heap[0]!;
		const last = heap.pop()!;
		if (heap.length > 0) {
			heap[0] = last;
			let i = 0;
			for (;;) {
				const l = 2 * i + 1;
				const r = 2 * i + 2;
				let smallest = i;
				if (l < heap.length && heap[l]!.f < heap[smallest]!.f) {
					smallest = l;
				}
				if (r < heap.length && heap[r]!.f < heap[smallest]!.f) {
					smallest = r;
				}
				if (smallest === i) {
					break;
				}
				[heap[smallest], heap[i]] = [heap[i]!, heap[smallest]!];
				i = smallest;
			}
		}
		return top.id;
	}
}

export const findPath = (
	graph: NavGraph,
	start: NavNode,
	goal: NavNode,
): NavPathStep[] | null => {
	if (start.id === goal.id) {
		return [{ node: start, edge: null }];
	}
	const goalFeet = nodeFeet(goal);
	const gScore = new Map<number, number>();
	const cameFrom = new Map<number, { from: number; edge: NavEdge }>();
	const open = new MinHeap();
	gScore.set(start.id, 0);
	open.push(start.id, nodeFeet(start).distanceTo(goalFeet));
	const closed = new Set<number>();

	while (open.size > 0) {
		const current = open.pop();
		if (current === goal.id) {
			return reconstruct(graph, cameFrom, start, goal);
		}
		if (closed.has(current)) {
			continue;
		}
		closed.add(current);
		const currentG = gScore.get(current)!;
		for (const edge of graph.edges(current)) {
			const tentative = currentG + edge.cost;
			if (tentative < (gScore.get(edge.to) ?? Infinity)) {
				gScore.set(edge.to, tentative);
				cameFrom.set(edge.to, { from: current, edge });
				const feet = nodeFeet(graph.nodes[edge.to]!);
				open.push(edge.to, tentative + feet.distanceTo(goalFeet));
			}
		}
	}
	return null;
};

const reconstruct = (
	graph: NavGraph,
	cameFrom: Map<number, { from: number; edge: NavEdge }>,
	start: NavNode,
	goal: NavNode,
): NavPathStep[] => {
	const steps: NavPathStep[] = [];
	let current = goal.id;
	while (current !== start.id) {
		const link = cameFrom.get(current)!;
		steps.push({ node: graph.nodes[current]!, edge: link.edge });
		current = link.from;
	}
	steps.push({ node: start, edge: null });
	steps.reverse();
	return steps;
};
