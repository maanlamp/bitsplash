import type { ActionCatalog } from "./action-catalog";
import type {
	DanglingRef,
	DroppedEdge,
	Expansion,
} from "./ref-expansion";

export type Conflict = Readonly<{ token: string; actions: string[] }>;

export type LinkedPair = Readonly<{
	referrer: string;
	target: string;
	token: string;
}>;

export type EssentialViolation = Readonly<{ action: string }>;

const tokensOf = (source: {
	readonly kind: "tokens" | "chord";
	readonly tokens: readonly string[];
}): readonly string[] => source.tokens;

export class ConflictDiagnostics {
	compute(expansion: Expansion): Conflict[] {
		const owners = new Map<string, Set<string>>();
		for (const e of expansion.bindings) {
			if (e.viaRef) {
				continue;
			}
			for (const t of tokensOf(e.source)) {
				const set = owners.get(t) ?? new Set<string>();
				set.add(e.owner);
				owners.set(t, set);
			}
		}
		const conflicts: Conflict[] = [];
		for (const [token, set] of owners) {
			if (set.size >= 2) {
				conflicts.push({ token, actions: [...set].toSorted() });
			}
		}
		return conflicts.toSorted((a, b) =>
			a.token.localeCompare(b.token),
		);
	}

	linked(expansion: Expansion): LinkedPair[] {
		const seen = new Set<string>();
		const pairs: LinkedPair[] = [];
		for (const e of expansion.bindings) {
			if (!e.viaRef || e.owner === e.action) {
				continue;
			}
			for (const t of tokensOf(e.source)) {
				const key = `${e.action}#${e.owner}#${t}`;
				if (seen.has(key)) {
					continue;
				}
				seen.add(key);
				pairs.push({ referrer: e.action, target: e.owner, token: t });
			}
		}
		return pairs;
	}
}

export class DanglingRefDiagnostics {
	compute(expansion: Expansion): DanglingRef[] {
		const seen = new Set<string>();
		const out: DanglingRef[] = [];
		for (const d of expansion.danglingRefs) {
			const key = `${d.action}#${d.target}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			out.push(d);
		}
		return out;
	}
}

export class CycleEdgeDroppedDiagnostics {
	compute(expansion: Expansion): DroppedEdge[] {
		const seen = new Set<string>();
		const out: DroppedEdge[] = [];
		for (const d of expansion.droppedEdges) {
			const key = `${d.from}#${d.to}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			out.push(d);
		}
		return out;
	}
}

export class EssentialGuard {
	constructor(private readonly catalog: ActionCatalog) {}

	compute(expansion: Expansion): EssentialViolation[] {
		const violations: EssentialViolation[] = [];
		for (const action of this.catalog.actions) {
			if (!action.essential) {
				continue;
			}
			const tokens = new Set<string>();
			for (const e of expansion.byAction.get(action.id) ?? []) {
				for (const t of tokensOf(e.source)) {
					tokens.add(t);
				}
			}
			if (tokens.size === 0) {
				violations.push({ action: action.id });
			}
		}
		return violations;
	}
}
