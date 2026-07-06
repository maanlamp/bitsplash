import { TILE_SIZE } from "../tilemap/tile";
import Vector2 from "../vector2";

export type NavEdgeKind = "walk" | "fall" | "jump";

export type NavNode = Readonly<{
	id: number;
	gx: number;
	gy: number;
}>;

export type NavEdge = Readonly<{
	to: number;
	kind: NavEdgeKind;
	cost: number;
	launchVy: number;
	moveScale: number;
}>;

export const nodeFeet = (node: NavNode): Vector2 =>
	new Vector2((node.gx + 0.5) * TILE_SIZE, (node.gy + 1) * TILE_SIZE);

export class NavGraph {
	readonly version: number;
	readonly nodes: ReadonlyArray<NavNode>;
	private readonly edgeMap: ReadonlyMap<
		number,
		ReadonlyArray<NavEdge>
	>;
	private readonly index: ReadonlyMap<string, NavNode>;

	constructor(
		version: number,
		nodes: ReadonlyArray<NavNode>,
		edgeMap: ReadonlyMap<number, ReadonlyArray<NavEdge>>,
	) {
		this.version = version;
		this.nodes = nodes;
		this.edgeMap = edgeMap;
		const index = new Map<string, NavNode>();
		for (const node of nodes) {
			index.set(`${node.gx},${node.gy}`, node);
		}
		this.index = index;
	}

	edges(id: number): ReadonlyArray<NavEdge> {
		return this.edgeMap.get(id) ?? [];
	}

	nodeAt(gx: number, gy: number): NavNode | null {
		return this.index.get(`${gx},${gy}`) ?? null;
	}

	nearestNode(worldPos: Vector2, maxDrop: number): NavNode | null {
		let best: NavNode | null = null;
		let bestScore = Infinity;
		for (const node of this.nodes) {
			const feet = nodeFeet(node);
			const dropDown = feet.y - worldPos.y;
			if (dropDown < -TILE_SIZE || dropDown > maxDrop + TILE_SIZE) {
				continue;
			}
			const score = feet.distanceToSq(worldPos);
			if (score < bestScore) {
				bestScore = score;
				best = node;
			}
		}
		if (best) {
			return best;
		}
		for (const node of this.nodes) {
			const score = nodeFeet(node).distanceToSq(worldPos);
			if (score < bestScore) {
				bestScore = score;
				best = node;
			}
		}
		return best;
	}
}
