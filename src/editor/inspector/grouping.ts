import { fieldOptions } from "../../engine/serialization/registry";

export type Row =
	| Readonly<{ kind: "single"; key: string }>
	| Readonly<{ kind: "paired"; keys: readonly string[] }>;

// Fields sharing a `group` token render side by side in one row, each keeping
// its own label; everything else is a single-field row. No name-derived
// legends or adornments — presentation adornments are owned by value-type
// renderers (e.g. Vector2's X/Y), never inferred from field names.
export const buildRows = (
	keys: readonly string[],
	typeName: string | undefined,
): readonly Row[] => {
	const groupOf = (key: string): string | undefined =>
		typeName ? fieldOptions(typeName, key)?.group : undefined;

	const consumed = new Set<string>();
	const rows: Row[] = [];

	for (const key of keys) {
		if (consumed.has(key)) {
			continue;
		}
		const token = groupOf(key);
		if (token === undefined) {
			consumed.add(key);
			rows.push({ kind: "single", key });
			continue;
		}
		const members = keys.filter((k) => groupOf(k) === token);
		members.forEach((k) => consumed.add(k));
		rows.push(
			members.length > 1
				? { kind: "paired", keys: members }
				: { kind: "single", key },
		);
	}

	return rows;
};
