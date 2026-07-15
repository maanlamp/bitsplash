import type { SerializableValue } from "../serialization/serializable-value";

export type OpParams = Readonly<{ [key: string]: SerializableValue }>;

export type ActorRef = string;

export type Vec2 = Readonly<{ x: number; y: number }>;

export type PointRef =
	| Vec2
	| Readonly<{ relTo: ActorRef; dx?: number; dy?: number }>;

export type PredicateRef = Readonly<{
	predicate: string;
	params: OpParams;
}>;

export type SeqNode = Readonly<{
	kind: "seq";
	stepId: string;
	children: ReadonlyArray<OpNode>;
}>;

export type ParallelNode = Readonly<{
	kind: "parallel";
	stepId: string;
	children: ReadonlyArray<OpNode>;
}>;

export type BranchNode = Readonly<{
	kind: "branch";
	stepId: string;
	cond: PredicateRef;
	whenTrue: OpNode;
	whenFalse: OpNode | null;
}>;

export type WaitUntilNode = Readonly<{
	kind: "waitUntil";
	stepId: string;
	cond: PredicateRef;
}>;

export type WaitNode = Readonly<{
	kind: "wait";
	stepId: string;
	seconds: number;
}>;

export type LeafOpNode = Readonly<{
	kind: "op";
	type: string;
	stepId: string;
	params: OpParams;
}>;

export type StructuralNode =
	| SeqNode
	| ParallelNode
	| BranchNode
	| WaitUntilNode
	| WaitNode;

export type OpNode = StructuralNode | LeafOpNode;

export const STRUCTURAL_KINDS: ReadonlyArray<StructuralNode["kind"]> =
	["seq", "parallel", "branch", "waitUntil", "wait"];

export const childrenOf = (node: OpNode): ReadonlyArray<OpNode> => {
	switch (node.kind) {
		case "seq":
		case "parallel":
			return node.children;
		case "branch":
			return node.whenFalse === null
				? [node.whenTrue]
				: [node.whenTrue, node.whenFalse];
		default:
			return [];
	}
};

export const walkNodes = (
	node: OpNode,
	visit: (node: OpNode) => void,
): void => {
	visit(node);
	for (const child of childrenOf(node)) {
		walkNodes(child, visit);
	}
};
