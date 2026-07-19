import { useSyncExternalStore } from "react";
import {
	CONSOLE_LEVELS,
	type ConsoleEntry,
	type ConsoleLevel,
	type SnapshotValue,
} from "./console-entry";
import { snapshotWithSignature } from "./console-snapshot";

/**
 * Console capture store + global-`console` patch.
 *
 * Importing this module is a **side effect**: it patches
 * `console.{log,warn,error,info,debug,table}` so every call is snapshotted into
 * a bounded ring buffer while still passing through to the real console (real
 * devtools keeps working). Wire it up once, eagerly, from `main.tsx`.
 */

/** Ring-buffer capacity — oldest entries drop once exceeded. */
const HISTORY_CAP = 1000;

type OriginalMethod = (...args: unknown[]) => void;

type Store = {
	/** Ring buffer; mutated in place — identity never changes (see {@link consoleVersion}). */
	readonly history: ConsoleEntry[];
	/**
	 * Immutable view of {@link Store.history}, rebuilt (new reference) only when
	 * the buffer changes. This is the `useSyncExternalStore` snapshot: a stable
	 * identity between changes and a fresh one after each, so memoized consumers
	 * (which key on the array reference, not a side-channel version) re-run.
	 */
	snapshot: ReadonlyArray<ConsoleEntry>;
	/** True when {@link Store.snapshot} is stale and must be rebuilt on next read. */
	snapshotDirty: boolean;
	nextId: number;
	version: number;
	readonly listeners: Set<() => void>;
	/** Re-entrancy guard: true while a capture is in flight. */
	capturing: boolean;
	/** True while a coalesced notify is already scheduled for this frame. */
	scheduled: boolean;
	patched: boolean;
};

/**
 * The store lives on `globalThis` under a well-known symbol so HMR / StrictMode
 * re-imports reuse the same buffer and listeners rather than orphaning them, and
 * so the patch is installed exactly once across re-imports.
 */
const REGISTRY = Symbol.for("bitsplash.console.registry");

const createStore = (): Store => ({
	history: [],
	snapshot: [],
	snapshotDirty: false,
	nextId: 1,
	version: 0,
	listeners: new Set(),
	capturing: false,
	scheduled: false,
	patched: false,
});

const globalScope = globalThis as unknown as { [REGISTRY]?: Store };
const store: Store = (globalScope[REGISTRY] ??= createStore());

/**
 * Bump the version once per frame and notify subscribers a single time, no
 * matter how many logs landed since the last flush — a burst of per-frame logs
 * collapses into one React re-render.
 */
const scheduleNotify = (): void => {
	if (store.scheduled) {
		return;
	}
	store.scheduled = true;
	const flush = (): void => {
		store.scheduled = false;
		store.version++;
		for (const listener of store.listeners) {
			listener();
		}
	};
	if (typeof requestAnimationFrame === "function") {
		requestAnimationFrame(flush);
	} else {
		queueMicrotask(flush);
	}
};

const record = (
	level: ConsoleLevel,
	args: readonly unknown[],
): void => {
	if (store.capturing) {
		return;
	}
	store.capturing = true;
	try {
		const snapped: SnapshotValue[] = [];
		let signature = level;
		for (const arg of args) {
			const walked = snapshotWithSignature(arg);
			snapped.push(walked.value);
			signature += `|${walked.signature}`;
		}

		const last = store.history[store.history.length - 1];
		if (last && last.signature === signature) {
			store.history[store.history.length - 1] = {
				...last,
				count: last.count + 1,
			};
		} else {
			store.history.push({
				id: store.nextId++,
				level,
				args: snapped,
				signature,
				timestamp: new Date(),
				count: 1,
			});
			if (store.history.length > HISTORY_CAP) {
				store.history.shift();
			}
		}
		store.snapshotDirty = true;
		scheduleNotify();
	} catch {
		// The walker is bounded and never throws; this only guarantees that a
		// capture failure can never break the underlying console call.
	} finally {
		store.capturing = false;
	}
};

const installPatch = (): void => {
	if (store.patched) {
		return;
	}
	store.patched = true;
	const target = console as unknown as Record<string, unknown>;
	for (const level of CONSOLE_LEVELS) {
		const original = target[level];
		if (typeof original !== "function") {
			continue;
		}
		const bound = (original as OriginalMethod).bind(console);
		target[level] = (...args: unknown[]): void => {
			bound(...args);
			record(level, args);
		};
	}
};

installPatch();

/** The current capture history, oldest first. The live array — identity is stable across logs. */
export const consoleHistory = (): ReadonlyArray<ConsoleEntry> =>
	store.history;

/**
 * The `useSyncExternalStore` snapshot: an immutable copy of the history whose
 * reference changes only when the buffer changes. Unlike {@link consoleHistory}
 * (a stable-identity live array), this is safe to depend on in a memo — React
 * and the React Compiler detect a change by reference, and the compiler keys
 * memoization on values it sees read, so a side-channel version counter cannot
 * substitute. Returns the same reference on repeated calls until the next change.
 */
export const getConsoleSnapshot = (): ReadonlyArray<ConsoleEntry> => {
	if (store.snapshotDirty) {
		store.snapshot = store.history.slice();
		store.snapshotDirty = false;
	}
	return store.snapshot;
};

/**
 * Subscribe to coalesced history changes. Returns an unsubscribe function.
 * Notifications fire at most once per frame regardless of log volume.
 */
export const subscribeConsole = (
	listener: () => void,
): (() => void) => {
	store.listeners.add(listener);
	return () => {
		store.listeners.delete(listener);
	};
};

/**
 * Monotonic version counter, bumped on each coalesced flush and on
 * {@link clearConsole}. Because the history array mutates in place, this is the
 * change signal `useSyncExternalStore` relies on.
 */
export const consoleVersion = (): number => store.version;

/** Hard-wipe the history buffer, then bump the version and notify immediately. */
export const clearConsole = (): void => {
	store.history.length = 0;
	store.snapshotDirty = true;
	store.version++;
	for (const listener of store.listeners) {
		listener();
	}
};

/**
 * React hook returning the console history. Re-renders on each coalesced change,
 * returning a fresh array reference so downstream memoization (filter, map)
 * correctly re-runs — see {@link getConsoleSnapshot} for why a stable-identity
 * array plus a version counter does not survive the React Compiler.
 *
 * @example
 * const entries = useConsole();
 * const rows = useMemo(() => entries.filter(keep), [entries]);
 */
export const useConsole = (): ReadonlyArray<ConsoleEntry> =>
	useSyncExternalStore(
		subscribeConsole,
		getConsoleSnapshot,
		getConsoleSnapshot,
	);
