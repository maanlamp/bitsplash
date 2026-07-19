import { Input } from "@base-ui/react/input";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
	MagnifyingGlassIcon,
	ProhibitIcon,
} from "@phosphor-icons/react";
import {
	chromeDark,
	ObjectInspector,
	ObjectLabel,
	ObjectPreview,
	ObjectRootLabel,
	TableInspector,
} from "react-inspector";
import classNames from "classnames";
import { useDeferredValue, useMemo, useState } from "react";
import Button from "../button";
import controls from "../styles/controls.module.scss";
import { clearConsole, useConsole } from "./console-capture";
import {
	type ConsoleEntry,
	type ConsoleLevel,
	type SnapshotTag,
	type SnapshotValue,
	snapshotTag,
} from "./console-entry";
import { ConsoleErrorBoundary } from "./console-error-boundary";
import styles from "./console-view.module.scss";

/**
 * react-inspector theme whose colors resolve to design tokens. Values are CSS
 * `var(--…)` strings, which react-inspector applies inline (it does no color
 * math on them), so the tree tracks the editor theme with no `getComputedStyle`.
 * The `theme` prop is typed `string` upstream but accepts a theme object at
 * runtime; the cast at the call site bridges that. Kept at module scope so the
 * React Compiler never treats it as a changing prop and remounts the tree.
 */
const CONSOLE_THEME = {
	...chromeDark,
	BASE_FONT_FAMILY: "var(--font-family-mono)",
	BASE_FONT_SIZE: "var(--text-sm)",
	TREENODE_FONT_FAMILY: "var(--font-family-mono)",
	TREENODE_FONT_SIZE: "var(--text-sm)",
	BASE_BACKGROUND_COLOR: "transparent",
	BASE_COLOR: "var(--on-surface)",
	OBJECT_NAME_COLOR: "var(--console-key)",
	OBJECT_VALUE_NULL_COLOR: "var(--console-null)",
	OBJECT_VALUE_UNDEFINED_COLOR: "var(--console-null)",
	OBJECT_VALUE_REGEXP_COLOR: "var(--console-regexp)",
	OBJECT_VALUE_STRING_COLOR: "var(--console-string)",
	OBJECT_VALUE_SYMBOL_COLOR: "var(--console-symbol)",
	OBJECT_VALUE_NUMBER_COLOR: "var(--console-number)",
	OBJECT_VALUE_BOOLEAN_COLOR: "var(--console-boolean)",
	OBJECT_VALUE_FUNCTION_PREFIX_COLOR: "var(--console-boolean)",
	ARROW_COLOR: "var(--on-surface-faint)",
};

/** react-inspector's per-row renderer argument. */
type NodeRendererProps = Readonly<{
	depth: number;
	name?: string;
	data: SnapshotValue;
	isNonenumerable?: boolean;
}>;

const tagColor = (kind: SnapshotTag["kind"]): string => {
	switch (kind) {
		case "function":
			return "var(--console-boolean)";
		case "error":
			return "var(--console-level-error)";
		case "date":
			return "var(--console-string)";
		default:
			return "var(--on-surface-faint)";
	}
};

/** The searchable / leaf-display text of a tagged node. */
const tagLabel = (tag: SnapshotTag): string =>
	tag.kind === "class"
		? tag.name
		: "label" in tag
			? tag.label
			: "[Circular]";

/**
 * Maps tagged snapshot nodes to their DevTools-style label; everything else
 * falls through to react-inspector's own labels (which render plain objects,
 * arrays, and real `Map`/`Set`/`RegExp` natively).
 */
const nodeRenderer = (props: NodeRendererProps): React.ReactNode => {
	const { depth, name, data, isNonenumerable } = props;
	const tag = snapshotTag(data);
	if (tag) {
		const body =
			tag.kind === "class" ? (
				<>
					<span className={styles.className}>{tag.name} </span>
					<ObjectPreview data={data} />
				</>
			) : (
				<span style={{ color: tagColor(tag.kind) }}>
					{tagLabel(tag)}
				</span>
			);
		return (
			<span>
				{typeof name === "string" && (
					<span className={styles.key}>{name}: </span>
				)}
				{body}
			</span>
		);
	}
	return depth === 0 ? (
		<ObjectRootLabel name={name} data={data} />
	) : (
		<ObjectLabel
			name={name}
			data={data}
			isNonenumerable={isNonenumerable}
		/>
	);
};

const primitiveClass = (value: SnapshotValue): string | undefined => {
	switch (typeof value) {
		case "string":
			return styles.string;
		case "number":
		case "bigint":
			return styles.number;
		case "boolean":
			return styles.boolean;
		case "symbol":
			return styles.symbol;
		default:
			return styles.null;
	}
};

const primitiveText = (value: SnapshotValue): string => {
	if (value === undefined) {
		return "undefined";
	}
	if (value === null) {
		return "null";
	}
	if (typeof value === "symbol" || value instanceof RegExp) {
		return value.toString();
	}
	return String(value as string | number | boolean | bigint);
};

/** True for values react-inspector should render as an expandable tree. */
const isInspectable = (value: SnapshotValue): boolean =>
	typeof value === "object" &&
	value !== null &&
	!(value instanceof RegExp);

const inspectorProps = {
	theme: CONSOLE_THEME as unknown as string,
	nodeRenderer,
} as const;

/** One logged argument: an inspector tree for containers, a colored span otherwise. */
const Arg = ({ value }: Readonly<{ value: SnapshotValue }>) =>
	isInspectable(value) ? (
		<ObjectInspector data={value} {...inspectorProps} />
	) : value instanceof RegExp ? (
		<span className={styles.regexp}>{value.toString()}</span>
	) : (
		<span className={primitiveClass(value)}>
			{primitiveText(value)}
		</span>
	);

/** Bounded, inert stringification of a snapshot for text search. */
const SEARCH_CAP = 2000;
const searchCache = new WeakMap<ConsoleEntry, string>();

/** Search accumulator with an O(1) running length so the cap check is not O(n). */
type SearchAcc = { readonly parts: string[]; len: number };

const push = (acc: SearchAcc, text: string): void => {
	acc.parts.push(text);
	acc.len += text.length + 1;
};

const appendSearch = (value: SnapshotValue, acc: SearchAcc): void => {
	if (acc.len > SEARCH_CAP) {
		return;
	}
	const tag = snapshotTag(value);
	if (tag) {
		push(acc, tagLabel(tag));
	}
	if (value === null || value === undefined) {
		push(acc, String(value));
	} else if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
	) {
		push(acc, String(value));
	} else if (typeof value === "symbol" || value instanceof RegExp) {
		push(acc, value.toString());
	} else if (Array.isArray(value)) {
		for (const item of value) {
			appendSearch(item, acc);
		}
	} else if (value instanceof Map) {
		for (const [k, v] of value) {
			appendSearch(k, acc);
			appendSearch(v, acc);
		}
	} else if (value instanceof Set) {
		for (const v of value) {
			appendSearch(v, acc);
		}
	} else if (typeof value === "object") {
		for (const [k, v] of Object.entries(value)) {
			push(acc, k);
			appendSearch(v as SnapshotValue, acc);
		}
	}
};

const searchText = (entry: ConsoleEntry): string => {
	const cached = searchCache.get(entry);
	if (cached !== undefined) {
		return cached;
	}
	const acc: SearchAcc = {
		parts: [entry.level],
		len: entry.level.length + 1,
	};
	for (const arg of entry.args) {
		appendSearch(arg, acc);
	}
	const text = acc.parts.join(" ").slice(0, SEARCH_CAP).toLowerCase();
	searchCache.set(entry, text);
	return text;
};

const LEVELS: ReadonlyArray<{ level: ConsoleLevel; label: string }> =
	[
		{ level: "log", label: "Log" },
		{ level: "info", label: "Info" },
		{ level: "debug", label: "Debug" },
		{ level: "warn", label: "Warn" },
		{ level: "error", label: "Error" },
		{ level: "table", label: "Table" },
	];

const ALL_LEVELS = LEVELS.map((l) => l.level);

const levelRowClass = (level: ConsoleLevel): string | undefined => {
	if (level === "warn") {
		return styles.warn;
	}
	if (level === "error") {
		return styles.error;
	}
	return undefined;
};

const Row = ({ entry }: Readonly<{ entry: ConsoleEntry }>) => (
	<li className={classNames(styles.row, levelRowClass(entry.level))}>
		<ConsoleErrorBoundary
			fallback={
				<span className={styles.null}>[unrenderable log entry]</span>
			}
		>
			<span className={styles.args}>
				{entry.level === "table" ? (
					<TableInspector
						data={entry.args[0]}
						theme={inspectorProps.theme}
					/>
				) : (
					entry.args.map((arg, i) => <Arg key={i} value={arg} />)
				)}
			</span>
		</ConsoleErrorBoundary>
		{entry.count > 1 && (
			<span className={styles.badge}>×{entry.count}</span>
		)}
		<time className={styles.time}>
			{entry.timestamp.toLocaleTimeString()}
		</time>
	</li>
);

/**
 * DevTools-style editor console: a filterable, searchable list of captured
 * console calls rendered with react-inspector value trees. Consumes the
 * snapshot store via {@link useConsole}; display-only (no REPL). Newest entries
 * stick to the bottom via `column-reverse` over a reversed list.
 */
export const ConsoleView = () => {
	const entries = useConsole();
	const [levels, setLevels] =
		useState<ReadonlyArray<ConsoleLevel>>(ALL_LEVELS);
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);

	const visible = useMemo(() => {
		const active = new Set(levels);
		const needle = deferredQuery.trim().toLowerCase();
		const filtered = entries.filter(
			(entry) =>
				active.has(entry.level) &&
				(needle === "" || searchText(entry).includes(needle)),
		);
		return filtered.reverse();
	}, [entries, levels, deferredQuery]);

	return (
		<div className={styles.console}>
			<div className={styles.toolbar}>
				<ToggleGroup
					multiple
					value={levels}
					onValueChange={(value) => setLevels(value)}
					className={controls.toggleGroup}
				>
					{LEVELS.map(({ level, label }) => (
						<Toggle
							key={level}
							value={level}
							className={controls.textToggle}
						>
							{label}
						</Toggle>
					))}
				</ToggleGroup>
				<label className={styles.search}>
					<MagnifyingGlassIcon />
					<Input
						className={styles.searchInput}
						placeholder="Filter"
						aria-label="Filter console"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
				</label>
				<Button
					variant="icon"
					onClick={clearConsole}
					aria-label="Clear console"
				>
					<ProhibitIcon />
				</Button>
			</div>
			<ol className={styles.log}>
				{visible.map((entry) => (
					<Row key={entry.id} entry={entry} />
				))}
			</ol>
		</div>
	);
};
