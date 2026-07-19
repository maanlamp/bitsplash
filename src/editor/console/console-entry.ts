/**
 * Shared contract between the console capture/snapshot workstream and the view
 * workstream. Both sides bind to these types; nothing else couples them.
 *
 * A {@link SnapshotValue} is an **inert** reconstruction of a logged value,
 * produced at log time so the view renders what was logged, not the current
 * (per-frame-mutated) state. It is built to render natively in `react-inspector`
 * wherever possible: primitives, arrays, plain objects, and real `Map`/`Set`/
 * `RegExp` instances are emitted directly (react-inspector renders those with
 * correct previews and disclosure). Only values react-inspector cannot render
 * inertly — class instances (whose constructor name must be preserved),
 * functions, DOM nodes, live engine handles, dates, errors, circular refs, and
 * truncation points — carry a non-enumerable {@link SNAPSHOT_TAG} describing how
 * the row should be labelled.
 */

/**
 * Non-enumerable marker key carrying render metadata for snapshot nodes that
 * react-inspector cannot reproduce from an inert value alone. Symbol-keyed so it
 * is invisible to react-inspector's `Object.getOwnPropertyNames` iteration (it
 * never shows up as a child row) while remaining readable by the custom
 * `nodeRenderer`.
 */
export const SNAPSHOT_TAG: unique symbol = Symbol(
	"bitsplash.snapshotTag",
);

/**
 * Render metadata attached to an exotic snapshot node.
 *
 * - `class` — an object node whose children (its snapshotted fields) expand
 *   natively; the row label is prefixed with the carried constructor `name`
 *   (`ClassName {…}`).
 * - every other kind is a **leaf** (no enumerable children): the `nodeRenderer`
 *   renders its `label` verbatim and react-inspector shows no disclosure arrow.
 */
export type SnapshotTag =
	| Readonly<{ kind: "class"; name: string }>
	| Readonly<{ kind: "function"; label: string }>
	| Readonly<{ kind: "dom"; label: string }>
	| Readonly<{ kind: "handle"; label: string }>
	| Readonly<{ kind: "date"; label: string }>
	| Readonly<{ kind: "error"; label: string }>
	| Readonly<{ kind: "circular" }>
	| Readonly<{ kind: "truncated"; label: string }>;

/** An object/array snapshot node, optionally carrying a render tag. */
export type SnapshotObject = {
	readonly [key: string]: SnapshotValue;
	readonly [SNAPSHOT_TAG]?: SnapshotTag;
};

/**
 * The inert, mutation-immune value the snapshot walker emits and the console
 * view renders. Primitives pass through; containers are reconstructed with
 * snapshotted contents; exotic nodes carry a {@link SNAPSHOT_TAG}.
 */
export type SnapshotValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| bigint
	| symbol
	| RegExp
	| ReadonlyArray<SnapshotValue>
	| ReadonlyMap<SnapshotValue, SnapshotValue>
	| ReadonlySet<SnapshotValue>
	| SnapshotObject;

/** Reads the render tag off a snapshot node, if any. */
export const snapshotTag = (
	value: SnapshotValue,
): SnapshotTag | undefined =>
	typeof value === "object" && value !== null
		? (value as SnapshotObject)[SNAPSHOT_TAG]
		: undefined;

/** The console methods this feature captures, in patch order. */
export const CONSOLE_LEVELS = [
	"log",
	"warn",
	"error",
	"info",
	"debug",
	"table",
] as const;

/** One of the captured console methods. */
export type ConsoleLevel = (typeof CONSOLE_LEVELS)[number];

/**
 * One captured console call. Immutable: duplicate folding replaces the last
 * entry with a new object carrying an incremented {@link ConsoleEntry.count},
 * so per-row identity (keyed by {@link ConsoleEntry.id}) stays stable while the
 * backing history array mutates in place.
 */
export type ConsoleEntry = Readonly<{
	/** Monotonic id, stable across folds — the React key for the row. */
	id: number;
	level: ConsoleLevel;
	/** The snapshotted arguments, in call order. */
	args: ReadonlyArray<SnapshotValue>;
	/** Structural signature of `level` + args, used for duplicate folding. */
	signature: string;
	timestamp: Date;
	/** Fold multiplier: how many consecutive identical calls this represents. */
	count: number;
}>;
