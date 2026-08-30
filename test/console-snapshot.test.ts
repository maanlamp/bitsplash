import { describe, expect, test } from "bun:test";
import {
	SNAPSHOT_TAG,
	type SnapshotObject,
	type SnapshotTag,
	type SnapshotValue,
	snapshotTag,
} from "../src/editor/console/console-entry";
import {
	signatureOf,
	snapshot,
	snapshotWithSignature,
} from "../src/editor/console/console-snapshot";

/** Narrows a snapshot node to an object for keyed access in assertions. */
const asObject = (
	value: SnapshotValue | undefined,
): SnapshotObject => {
	expect(value !== null && typeof value === "object").toBe(true);
	return value as SnapshotObject;
};

/** Reads a defined field off a snapshot object node. */
const field = (obj: SnapshotObject, key: string): SnapshotValue => {
	const value = obj[key];
	expect(value).toBeDefined();
	return value;
};

/** Reads the render tag off a possibly-undefined snapshot node. */
const named = function doThing(): void {};

const tagOf = (
	value: SnapshotValue | undefined,
): SnapshotTag | undefined => snapshotTag(value);

describe("snapshot — primitives", () => {
	test("passes primitives through unchanged", () => {
		expect(snapshot("hi")).toBe("hi");
		expect(snapshot(42)).toBe(42);
		expect(snapshot(true)).toBe(true);
		expect(snapshot(null)).toBeNull();
		expect(snapshot(undefined)).toBeUndefined();
		expect(snapshot(10n)).toBe(10n);
		const sym = Symbol("s");
		expect(snapshot(sym)).toBe(sym);
	});
});

describe("snapshot — structure", () => {
	test("preserves nested plain object/array structure", () => {
		const source = { a: 1, b: [2, 3], c: { d: "x" } };
		const snap = asObject(snapshot(source));
		expect(field(snap, "a")).toBe(1);
		expect(field(snap, "b")).toEqual([2, 3]);
		expect(field(asObject(field(snap, "c")), "d")).toBe("x");
		expect(tagOf(snap)).toBeUndefined();
	});

	test("mutation immunity: mutating the source never touches the snapshot", () => {
		const source: {
			n: number;
			list: number[];
			nested: { v: number };
		} = {
			n: 1,
			list: [1, 2],
			nested: { v: 5 },
		};
		const snap = asObject(snapshot(source));
		source.n = 999;
		source.list.push(3);
		source.nested.v = 999;
		expect(field(snap, "n")).toBe(1);
		expect(field(snap, "list")).toEqual([1, 2]);
		expect(field(asObject(field(snap, "nested")), "v")).toBe(5);
	});
});

describe("snapshot — guards", () => {
	test("circular reference emits a circular leaf without throwing", () => {
		const source: Record<string, unknown> = { name: "root" };
		source.self = source;
		const snap = asObject(snapshot(source));
		expect(field(snap, "name")).toBe("root");
		expect(tagOf(field(snap, "self"))).toEqual({ kind: "circular" });
	});

	test("a repeated (non-cyclic) sibling is not flagged circular", () => {
		const shared = { v: 1 };
		const snap = asObject(snapshot({ a: shared, b: shared }));
		expect(tagOf(field(snap, "a"))).toBeUndefined();
		expect(tagOf(field(snap, "b"))).toBeUndefined();
	});

	test("depth cap emits a [Truncated] leaf", () => {
		let deep: Record<string, unknown> = { leaf: true };
		for (let i = 0; i < 12; i++) {
			deep = { child: deep };
		}
		const seen: string[] = [];
		const collect = (value: SnapshotValue | undefined): void => {
			const tag = tagOf(value);
			if (tag) {
				seen.push(tag.kind);
			}
			if (typeof value === "object" && value !== null && !tag) {
				for (const key of Object.keys(value)) {
					collect((value as SnapshotObject)[key]);
				}
			}
		};
		collect(snapshot(deep));
		expect(seen).toContain("truncated");
	});

	test("breadth cap on a huge array is bounded and ends with a truncation leaf", () => {
		const huge = Array.from({ length: 100_000 }, (_, i) => i);
		const snap = snapshot(huge) as ReadonlyArray<SnapshotValue>;
		expect(Array.isArray(snap)).toBe(true);
		expect(snap.length).toBe(101);
		expect(tagOf(snap.at(-1))).toEqual({
			kind: "truncated",
			label: "… 99900 more",
		});
	});

	test("breadth cap on many object keys emits a truncation leaf", () => {
		const wide: Record<string, number> = {};
		for (let i = 0; i < 250; i++) {
			wide[`k${i}`] = i;
		}
		const snap = asObject(snapshot(wide));
		expect(Object.keys(snap).length).toBe(101);
		expect(tagOf(field(snap, "…"))).toEqual({
			kind: "truncated",
			label: "… 150 more",
		});
	});

	test("throwing getter becomes an unreadable handle leaf, never throws", () => {
		const source = {
			safe: 1,
			get boom(): number {
				throw new Error("no");
			},
		};
		const snap = asObject(snapshot(source));
		expect(field(snap, "safe")).toBe(1);
		expect(tagOf(field(snap, "boom"))).toEqual({
			kind: "handle",
			label: "[unreadable]",
		});
	});
});

describe("snapshot — classes vs plain objects", () => {
	class Vec {
		constructor(
			public x: number,
			public y: number,
		) {}
	}

	test("class instance carries a class tag and keeps its fields", () => {
		const snap = asObject(snapshot(new Vec(3, 4)));
		expect(tagOf(snap)).toEqual({ kind: "class", name: "Vec" });
		expect(field(snap, "x")).toBe(3);
		expect(field(snap, "y")).toBe(4);
	});

	test("plain object carries no class tag", () => {
		expect(tagOf(asObject(snapshot({ x: 1 })))).toBeUndefined();
	});

	test("null-prototype object is treated as plain", () => {
		const bare = Object.assign(Object.create(null), { a: 1 });
		expect(tagOf(asObject(snapshot(bare)))).toBeUndefined();
	});
});

describe("snapshot — exotic containers", () => {
	test("Map is reconstructed as a real Map with snapshotted entries", () => {
		const source = new Map<string, unknown>([
			["a", { v: 1 }],
			["b", 2],
		]);
		const snap = snapshot(source);
		expect(snap).toBeInstanceOf(Map);
		const map = snap as ReadonlyMap<SnapshotValue, SnapshotValue>;
		expect(field(asObject(map.get("a")), "v")).toBe(1);
		expect(map.get("b")).toBe(2);
	});

	test("Set is reconstructed as a real Set with snapshotted values", () => {
		const snap = snapshot(new Set([1, 2, 3]));
		expect(snap).toBeInstanceOf(Set);
		expect([...(snap as ReadonlySet<SnapshotValue>)]).toEqual([
			1, 2, 3,
		]);
	});

	test("RegExp is reconstructed as a real cloned RegExp", () => {
		const snap = snapshot(/ab+c/gi);
		expect(snap).toBeInstanceOf(RegExp);
		const re = snap as RegExp;
		expect(re.source).toBe("ab+c");
		expect(re.flags).toBe("gi");
	});

	test("typed array becomes a class-tagged capped object node", () => {
		const snap = asObject(snapshot(new Int8Array([1, 2, 3])));
		expect(tagOf(snap)).toEqual({ kind: "class", name: "Int8Array" });
		expect(field(snap, "0")).toBe(1);
		expect(field(snap, "2")).toBe(3);
	});

	test("huge typed array is bounded", () => {
		const snap = asObject(snapshot(new Float64Array(1_000_000)));
		expect(Object.keys(snap).length).toBe(101);
		expect(tagOf(field(snap, "…"))).toEqual({
			kind: "truncated",
			label: "… 999900 more",
		});
	});
});

describe("snapshot — exotic leaves", () => {
	test("Date leaf carries its ISO string, invalid dates guarded", () => {
		const snap = snapshot(new Date("2020-01-02T03:04:05.000Z"));
		expect(tagOf(snap)).toEqual({
			kind: "date",
			label: "2020-01-02T03:04:05.000Z",
		});
		expect(tagOf(snapshot(new Date(Number.NaN)))).toEqual({
			kind: "date",
			label: "Invalid Date",
		});
	});

	test("Error leaf carries name and message", () => {
		expect(tagOf(snapshot(new TypeError("bad")))).toEqual({
			kind: "error",
			label: "TypeError: bad",
		});
	});

	test("function leaf carries its name", () => {
		expect(tagOf(snapshot(named))).toEqual({
			kind: "function",
			label: "ƒ doThing",
		});
		expect(tagOf(snapshot(() => 1))).toEqual({
			kind: "function",
			label: expect.stringContaining("ƒ "),
		});
	});

	test("DOM-like object becomes a dom leaf", () => {
		const fakeNode = {
			nodeType: 1,
			nodeName: "DIV",
			id: "app",
			className: "a b",
		};
		expect(tagOf(snapshot(fakeNode))).toEqual({
			kind: "dom",
			label: "<div#app.a.b>",
		});
	});

	test("a leaf carries the tag non-enumerably (no child rows)", () => {
		const snap = snapshot(() => {}) as SnapshotObject;
		expect(Object.keys(snap)).toEqual([]);
		expect(Object.getOwnPropertyNames(snap)).toEqual([]);
		expect(snap[SNAPSHOT_TAG]).toBeDefined();
	});
});

describe("signature", () => {
	test("structurally identical objects with different numeric values fold", () => {
		expect(signatureOf({ x: 1, y: 2 })).toBe(
			signatureOf({ x: 9, y: 8 }),
		);
		expect(signatureOf([1, 2, 3])).toBe(signatureOf([4, 5, 6]));
	});

	test("different keys or shapes produce different signatures", () => {
		expect(signatureOf({ x: 1 })).not.toBe(signatureOf({ y: 1 }));
		expect(signatureOf({ x: 1 })).not.toBe(
			signatureOf({ x: 1, z: 2 }),
		);
		expect(signatureOf([1, 2])).not.toBe(signatureOf([1, 2, 3]));
		expect(signatureOf(1)).not.toBe(signatureOf("1"));
	});

	test("string values are distinguished in the signature", () => {
		expect(signatureOf("hello")).not.toBe(signatureOf("world"));
		expect(signatureOf("hello")).toBe(signatureOf("hello"));
	});

	test("snapshotWithSignature returns value and signature from one walk", () => {
		const result = snapshotWithSignature({ a: 1 });
		expect(field(asObject(result.value), "a")).toBe(1);
		expect(result.signature).toBe(signatureOf({ a: 1 }));
	});
});
