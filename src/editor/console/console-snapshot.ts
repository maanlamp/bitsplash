import {
	SNAPSHOT_TAG,
	type SnapshotObject,
	type SnapshotTag,
	type SnapshotValue,
} from "./console-entry";

/**
 * Depth past which nested containers stop being walked and collapse to a
 * `{kind:"truncated"}` leaf. Bounds recursion so a deep or hostile graph can
 * never blow the stack.
 */
const MAX_DEPTH = 6;

/**
 * Maximum children walked per container (array elements, object keys, `Map`
 * entries, `Set`/typed-array values). Past this a single truncation sentinel is
 * emitted, so a million-element array costs `O(cap)`, never `O(n)`.
 */
const BREADTH_CAP = 100;

/** Upper bound on a tag `label` so an exotic value can't emit an unbounded string. */
const LABEL_MAX = 120;

/** Upper bound on a string's contribution to the structural signature. */
const SIGNATURE_STRING_MAX = 64;

/** Result of the single walk: the inert value plus its structural signature. */
type Walked = Readonly<{ value: SnapshotValue; signature: string }>;

const bound = (text: string, max: number = LABEL_MAX): string =>
	text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Attaches a render tag to an object node without exposing it as an enumerable child. */
const tagObject = (
	node: SnapshotObject,
	tag: SnapshotTag,
): SnapshotObject => {
	Object.defineProperty(node, SNAPSHOT_TAG, {
		value: tag,
		enumerable: false,
	});
	return node;
};

/** Builds a leaf node carrying only the (non-enumerable) render tag — no children. */
const leaf = (tag: SnapshotTag): SnapshotObject => tagObject({}, tag);

/** A truncation sentinel for the `rest` children dropped past a breadth cap. */
const moreLeaf = (rest: number): SnapshotObject =>
	leaf({ kind: "truncated", label: `… ${rest} more` });

type Read =
	| Readonly<{ ok: true; value: unknown }>
	| Readonly<{ ok: false; value?: undefined }>;

/** Reads one property, converting any throwing getter / revoked proxy into `{ok:false}`. */
const safeRead = (source: object, key: PropertyKey): Read => {
	try {
		return {
			ok: true,
			value: (source as Record<PropertyKey, unknown>)[key],
		};
	} catch {
		return { ok: false };
	}
};

const safeProto = (source: object): object | null => {
	try {
		return Object.getPrototypeOf(source);
	} catch {
		return null;
	}
};

const safeCtorName = (source: object): string | undefined => {
	try {
		return (source as { constructor?: { name?: string } }).constructor
			?.name;
	} catch {
		return undefined;
	}
};

const isDomNode = (source: object): boolean => {
	const nodeType = safeRead(source, "nodeType");
	const nodeName = safeRead(source, "nodeName");
	return (
		nodeType.ok &&
		typeof nodeType.value === "number" &&
		nodeName.ok &&
		typeof nodeName.value === "string"
	);
};

const domLabel = (source: object): string => {
	const nameRead = safeRead(source, "nodeName");
	const tag =
		typeof nameRead.value === "string"
			? nameRead.value.toLowerCase()
			: "node";
	const idRead = safeRead(source, "id");
	const id =
		typeof idRead.value === "string" && idRead.value
			? `#${idRead.value}`
			: "";
	const classRead = safeRead(source, "className");
	const classes =
		typeof classRead.value === "string" && classRead.value.trim()
			? classRead.value
					.trim()
					.split(/\s+/)
					.map((cls) => `.${cls}`)
					.join("")
			: "";
	return bound(`<${tag}${id}${classes}>`, 80);
};

const PRIMITIVE_SIGNATURE: Readonly<Record<string, string>> = {
	number: "n",
	boolean: "b",
	undefined: "u",
	bigint: "big",
	symbol: "sym",
};

/**
 * The one recursive pass. Produces the inert {@link SnapshotValue} and, from the
 * same traversal, a structural signature — never walking twice.
 *
 * `seen` holds the objects on the current path (a `WeakSet`), so a value is
 * flagged circular only when it truly closes a cycle, not when it merely repeats
 * across sibling branches (a DAG).
 */
const walk = (
	value: unknown,
	depth: number,
	seen: WeakSet<object>,
): Walked => {
	if (value === null) {
		return { value: null, signature: "null" };
	}

	const type = typeof value;
	if (type === "string") {
		return {
			value: value as string,
			signature: `s:${bound(value as string, SIGNATURE_STRING_MAX)}`,
		};
	}
	if (type !== "object" && type !== "function") {
		return {
			value: value as SnapshotValue,
			signature: PRIMITIVE_SIGNATURE[type] ?? type,
		};
	}
	if (type === "function") {
		const fn = value as { name?: string };
		return {
			value: leaf({
				kind: "function",
				label: `ƒ ${fn.name || "anonymous"}`,
			}),
			signature: "fn",
		};
	}

	const source = value as object;
	if (seen.has(source)) {
		return { value: leaf({ kind: "circular" }), signature: "circ" };
	}
	if (depth > MAX_DEPTH) {
		return {
			value: leaf({ kind: "truncated", label: "[Truncated]" }),
			signature: "trunc",
		};
	}

	if (source instanceof Date) {
		const label = Number.isNaN(source.getTime())
			? "Invalid Date"
			: source.toISOString();
		return {
			value: leaf({ kind: "date", label }),
			signature: "date",
		};
	}
	if (source instanceof RegExp) {
		return {
			value: new RegExp(source.source, source.flags),
			signature: "re",
		};
	}
	if (source instanceof Error) {
		return {
			value: leaf({
				kind: "error",
				label: bound(`${source.name}: ${source.message}`),
			}),
			signature: "err",
		};
	}
	if (source instanceof Map) {
		return walkMap(source, depth, seen);
	}
	if (source instanceof Set) {
		return walkSet(source, depth, seen);
	}
	if (isDomNode(source)) {
		return {
			value: leaf({ kind: "dom", label: domLabel(source) }),
			signature: "dom",
		};
	}
	if (ArrayBuffer.isView(source) && !(source instanceof DataView)) {
		return walkTypedArray(source, depth, seen);
	}
	if (Array.isArray(source)) {
		return walkArray(source, depth, seen);
	}
	return walkObject(source, depth, seen);
};

const walkArray = (
	source: ReadonlyArray<unknown>,
	depth: number,
	seen: WeakSet<object>,
): Walked => {
	seen.add(source);
	const value: SnapshotValue[] = [];
	let signature = "[";
	const cap = Math.min(source.length, BREADTH_CAP);
	for (const item of source.slice(0, cap)) {
		const child = walk(item, depth + 1, seen);
		value.push(child.value);
		signature += `${child.signature},`;
	}
	if (source.length > cap) {
		const rest = source.length - cap;
		value.push(moreLeaf(rest));
		signature += `+${rest}`;
	}
	seen.delete(source);
	return { value, signature: `${signature}]` };
};

const walkTypedArray = (
	node: object,
	depth: number,
	seen: WeakSet<object>,
): Walked => {
	const source = node as ArrayLike<unknown>;
	seen.add(node);
	const name = safeCtorName(node) ?? "TypedArray";
	const value: Record<string, SnapshotValue> = {};
	let signature = `C<${name}>[`;
	const cap = Math.min(source.length, BREADTH_CAP);
	for (let i = 0; i < cap; i++) {
		const child = walk(source[i], depth + 1, seen);
		value[i] = child.value;
		signature += `${child.signature},`;
	}
	if (source.length > cap) {
		const rest = source.length - cap;
		value["…"] = moreLeaf(rest);
		signature += `+${rest}`;
	}
	seen.delete(node);
	return {
		value: tagObject(value, {
			kind: "class",
			name,
		}),
		signature: `${signature}]`,
	};
};

const walkMap = (
	source: ReadonlyMap<unknown, unknown>,
	depth: number,
	seen: WeakSet<object>,
): Walked => {
	seen.add(source);
	const value = new Map<SnapshotValue, SnapshotValue>();
	let signature = "Map(";
	let i = 0;
	for (const [key, entry] of source) {
		if (i >= BREADTH_CAP) {
			const rest = source.size - i;
			value.set("…", moreLeaf(rest));
			signature += `+${rest}`;
			break;
		}
		const walkedKey = walk(key, depth + 1, seen);
		const walkedValue = walk(entry, depth + 1, seen);
		value.set(walkedKey.value, walkedValue.value);
		signature += `${walkedKey.signature}=>${walkedValue.signature},`;
		i++;
	}
	seen.delete(source);
	return { value, signature: `${signature})` };
};

const walkSet = (
	source: ReadonlySet<unknown>,
	depth: number,
	seen: WeakSet<object>,
): Walked => {
	seen.add(source);
	const value = new Set<SnapshotValue>();
	let signature = "Set(";
	let i = 0;
	for (const entry of source) {
		if (i >= BREADTH_CAP) {
			const rest = source.size - i;
			value.add(moreLeaf(rest));
			signature += `+${rest}`;
			break;
		}
		const child = walk(entry, depth + 1, seen);
		value.add(child.value);
		signature += `${child.signature},`;
		i++;
	}
	seen.delete(source);
	return { value, signature: `${signature})` };
};

const walkObject = (
	source: object,
	depth: number,
	seen: WeakSet<object>,
): Walked => {
	let keys: string[];
	try {
		keys = Object.keys(source);
	} catch {
		return {
			value: leaf({ kind: "handle", label: "[unreadable]" }),
			signature: "handle",
		};
	}

	const proto = safeProto(source);
	const isPlain = proto === Object.prototype || proto === null;
	const name = isPlain
		? undefined
		: (safeCtorName(source) ?? "Object");

	seen.add(source);
	const node: Record<string, SnapshotValue> = {};
	let signature = isPlain ? "{" : `C<${name}>{`;
	const cap = Math.min(keys.length, BREADTH_CAP);
	for (const key of keys.slice(0, cap)) {
		const read = safeRead(source, key);
		if (!read.ok) {
			node[key] = leaf({ kind: "handle", label: "[unreadable]" });
			signature += `${key}:handle,`;
			continue;
		}
		const child = walk(read.value, depth + 1, seen);
		node[key] = child.value;
		signature += `${key}:${child.signature},`;
	}
	if (keys.length > cap) {
		const rest = keys.length - cap;
		node["…"] = moreLeaf(rest);
		signature += `+${rest}`;
	}
	seen.delete(source);

	const value = isPlain
		? (node as SnapshotObject)
		: tagObject(node, {
				kind: "class",
				name: name as string,
			});
	return { value, signature: `${signature}}` };
};

/**
 * Walks any value into an inert, mutation-immune {@link SnapshotValue} for
 * later rendering, returning it alongside a structural signature computed in the
 * same pass. Never throws; bounded in depth and breadth.
 *
 * The signature captures each value's **type**, and for containers their
 * **shape** (length / keys) and the recursive signatures of their contents. It
 * deliberately omits the values of numbers, booleans, bigints and symbols so
 * that freshly-allocated per-frame objects differing only in numeric content
 * fold to one signature; string primitives contribute their (bounded) text so
 * distinct log messages and string fields stay distinguishable. Structurally
 * different values (different types, lengths, or keys) always differ.
 *
 * @example
 * const a = snapshotWithSignature({ x: 1, y: 2 });
 * const b = snapshotWithSignature({ x: 9, y: 8 });
 * a.signature === b.signature; // true — same shape, numeric values ignored
 */
export const snapshotWithSignature = (value: unknown): Walked =>
	walk(value, 0, new WeakSet());

/**
 * Walks any value into an inert, mutation-immune {@link SnapshotValue}.
 * Convenience over {@link snapshotWithSignature} when the signature is unneeded.
 */
export const snapshot = (value: unknown): SnapshotValue =>
	walk(value, 0, new WeakSet()).value;

/**
 * Structural signature of a value (see {@link snapshotWithSignature}). Prefer
 * {@link snapshotWithSignature} when both the snapshot and signature are needed,
 * to avoid walking twice.
 */
export const signatureOf = (value: unknown): string =>
	walk(value, 0, new WeakSet()).signature;
