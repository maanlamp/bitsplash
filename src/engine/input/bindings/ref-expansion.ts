import type {
	Activation,
	Binding,
	Chord,
	Tokens,
} from "./action-catalog";
import { parseToken } from "../edge-detector";

export type TerminalSource = Tokens | Chord;

export type ExpandedBinding = Readonly<{
	action: string;
	activation: Activation;
	source: TerminalSource;
	owner: string;
	viaRef: boolean;
}>;

export type DanglingRef = Readonly<{
	action: string;
	target: string;
}>;

export type DroppedEdge = Readonly<{ from: string; to: string }>;

export type Expansion = Readonly<{
	bindings: readonly ExpandedBinding[];
	byAction: ReadonlyMap<string, readonly ExpandedBinding[]>;
	danglingRefs: readonly DanglingRef[];
	droppedEdges: readonly DroppedEdge[];
	invalidChordTokens: readonly string[];
}>;

type Terminal = Readonly<{ source: TerminalSource; owner: string }>;

export const sourceKey = (source: TerminalSource): string => {
	const sorted = [...source.tokens].toSorted();
	return `${source.kind === "chord" ? "c" : "t"}|${sorted.join(",")}`;
};

const chordMemberInvalid = (source: Chord): string[] =>
	source.tokens.filter((t) => parseToken(t) === null);

const groupByAction = (
	bindings: readonly Binding[],
): Map<string, Binding[]> => {
	const byAction = new Map<string, Binding[]>();
	for (const b of bindings) {
		const list = byAction.get(b.action);
		if (list) {
			list.push(b);
		} else {
			byAction.set(b.action, [b]);
		}
	}
	return byAction;
};

export const expandBindings = (
	bindings: readonly Binding[],
): Expansion => {
	const byActionSources = groupByAction(bindings);
	const danglingRefs: DanglingRef[] = [];
	const droppedEdges: DroppedEdge[] = [];
	const invalidChordTokens: string[] = [];

	const terminalsOf = (
		action: string,
		path: Set<string>,
	): Terminal[] => {
		path.add(action);
		const seen = new Set<string>();
		const out: Terminal[] = [];
		for (const b of byActionSources.get(action) ?? []) {
			if (b.source.kind === "ref") {
				const target = b.source.action;
				if (!byActionSources.has(target)) {
					danglingRefs.push({ action, target });
					continue;
				}
				if (path.has(target)) {
					droppedEdges.push({ from: action, to: target });
					continue;
				}
				for (const terminal of terminalsOf(target, path)) {
					const key = `${sourceKey(terminal.source)}#${terminal.owner}`;
					if (!seen.has(key)) {
						seen.add(key);
						out.push(terminal);
					}
				}
				continue;
			}
			if (b.source.kind === "chord") {
				for (const bad of chordMemberInvalid(b.source)) {
					invalidChordTokens.push(bad);
				}
			}
			const key = `${sourceKey(b.source)}#${action}`;
			if (!seen.has(key)) {
				seen.add(key);
				out.push({ source: b.source, owner: action });
			}
		}
		path.delete(action);
		return out;
	};

	const expanded: ExpandedBinding[] = [];
	for (const b of bindings) {
		if (b.source.kind === "ref") {
			const target = b.source.action;
			if (!byActionSources.has(target)) {
				danglingRefs.push({ action: b.action, target });
				continue;
			}
			for (const terminal of terminalsOf(
				target,
				new Set([b.action]),
			)) {
				expanded.push({
					action: b.action,
					activation: b.activation,
					source: terminal.source,
					owner: terminal.owner,
					viaRef: true,
				});
			}
			continue;
		}
		if (b.source.kind === "chord") {
			for (const bad of chordMemberInvalid(b.source)) {
				invalidChordTokens.push(bad);
			}
		}
		expanded.push({
			action: b.action,
			activation: b.activation,
			source: b.source,
			owner: b.action,
			viaRef: false,
		});
	}

	const byAction = new Map<string, ExpandedBinding[]>();
	for (const e of expanded) {
		const list = byAction.get(e.action);
		if (list) {
			list.push(e);
		} else {
			byAction.set(e.action, [e]);
		}
	}

	return {
		bindings: expanded,
		byAction,
		danglingRefs,
		droppedEdges,
		invalidChordTokens,
	};
};

export const detectRefCycle = (
	bindings: readonly Binding[],
): DroppedEdge[] => {
	const edges = new Map<string, string[]>();
	const nodes = new Set<string>();
	for (const b of bindings) {
		nodes.add(b.action);
		if (b.source.kind === "ref") {
			const list = edges.get(b.action);
			if (list) {
				list.push(b.source.action);
			} else {
				edges.set(b.action, [b.source.action]);
			}
		}
	}

	const backEdges: DroppedEdge[] = [];
	const state = new Map<string, number>();
	const visit = (node: string): void => {
		state.set(node, 1);
		for (const next of [...(edges.get(node) ?? [])].toSorted()) {
			const s = state.get(next) ?? 0;
			if (s === 1) {
				backEdges.push({ from: node, to: next });
			} else if (s === 0 && nodes.has(next)) {
				visit(next);
			}
		}
		state.set(node, 2);
	};
	for (const node of [...nodes].toSorted()) {
		if ((state.get(node) ?? 0) === 0) {
			visit(node);
		}
	}
	return backEdges;
};

export class RefExpansion {
	private bindings: readonly Binding[] = [];
	private memo: Expansion | null = null;

	setBindings(bindings: readonly Binding[]): void {
		this.bindings = bindings;
		this.memo = null;
	}

	invalidate(): void {
		this.memo = null;
	}

	get expansion(): Expansion {
		if (this.memo === null) {
			this.memo = expandBindings(this.bindings);
		}
		return this.memo;
	}
}
