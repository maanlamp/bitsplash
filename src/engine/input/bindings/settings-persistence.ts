import type {
	ActionCatalog,
	Binding,
	Source,
} from "./action-catalog";
import type { SettingsStore } from "../settings-store";
import { detectRefCycle } from "./ref-expansion";

export const BINDINGS_VERSION = 1;

export const BINDINGS_KEY = "input.bindings";

export type BindingsBlob = Readonly<{
	version: number;
	bindings: Binding[];
}>;

export type LoadResult = Readonly<{
	bindings: Binding[];
	notices: string[];
}>;

const remapSource = (
	source: Source,
	migrations: Readonly<Record<string, string>>,
): Source => {
	if (source.kind === "ref") {
		return {
			kind: "ref",
			action: migrations[source.action] ?? source.action,
		};
	}
	return source;
};

const bindingKey = (b: Binding): string => JSON.stringify(b);

export class BindingsPersistence {
	constructor(
		private readonly store: SettingsStore,
		private readonly key: string = BINDINGS_KEY,
	) {}

	save(bindings: readonly Binding[]): void {
		const blob: BindingsBlob = {
			version: BINDINGS_VERSION,
			bindings: [...bindings],
		};
		this.store.set(this.key, JSON.stringify(blob));
	}

	load(
		catalog: ActionCatalog,
		migrations: Readonly<Record<string, string>> = {},
	): LoadResult {
		const notices: string[] = [];
		const seenNotice = new Set<string>();
		const notice = (message: string): void => {
			if (!seenNotice.has(message)) {
				seenNotice.add(message);
				notices.push(message);
			}
		};

		const defaults = catalog.defaults.map((b) => ({ ...b }));
		const raw = this.store.get(this.key);
		if (raw === null) {
			return { bindings: defaults, notices };
		}

		let blob: BindingsBlob;
		try {
			blob = JSON.parse(raw) as BindingsBlob;
		} catch {
			notice("Saved bindings were unreadable; restored defaults.");
			return { bindings: defaults, notices };
		}
		if (
			typeof blob !== "object" ||
			blob === null ||
			!Array.isArray(blob.bindings)
		) {
			notice("Saved bindings were malformed; restored defaults.");
			return { bindings: defaults, notices };
		}

		const actionIds = new Set(catalog.actions.map((a) => a.id));

		const remapped: Binding[] = [];
		for (const b of blob.bindings) {
			const action = migrations[b.action] ?? b.action;
			if (!actionIds.has(action)) {
				notice(`Dropped binding for unknown action "${action}".`);
				continue;
			}
			remapped.push({
				action,
				source: remapSource(b.source, migrations),
				activation: b.activation,
			});
		}

		const fallbackActions = new Set<string>();
		const resolved: Binding[] = [];
		for (const b of remapped) {
			if (
				b.source.kind === "ref" &&
				!actionIds.has(b.source.action)
			) {
				notice(
					`Reference target "${b.source.action}" is missing; fell back to default for "${b.action}".`,
				);
				fallbackActions.add(b.action);
				continue;
			}
			resolved.push(b);
		}

		const backEdges = new Set<string>();
		for (const edge of detectRefCycle(resolved)) {
			notice(
				`Dropped reference "${edge.from}" → "${edge.to}" to break a cycle.`,
			);
			fallbackActions.add(edge.from);
			backEdges.add(`${edge.from}#${edge.to}`);
		}
		const cycleFree = resolved.filter(
			(b) =>
				!(
					b.source.kind === "ref" &&
					backEdges.has(`${b.action}#${b.source.action}`)
				),
		);

		const present = new Set(cycleFree.map(bindingKey));
		for (const action of fallbackActions) {
			for (const def of defaults) {
				if (def.action !== action) {
					continue;
				}
				const k = bindingKey(def);
				if (!present.has(k)) {
					present.add(k);
					cycleFree.push({ ...def });
				}
			}
		}

		return { bindings: cycleFree, notices };
	}
}
