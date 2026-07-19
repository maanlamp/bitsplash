import {
	afterAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import type {
	ConsoleEntry,
	ConsoleLevel,
	SnapshotValue,
} from "../src/editor/console/console-entry";

/**
 * Importing `console-capture` patches the global console as a side effect. We
 * silence the real methods *before* the module binds its originals, so the
 * passthrough is a no-op during the test run, then restore them afterwards
 * (which also un-patches the console for any other test file).
 */
const LEVELS: readonly ConsoleLevel[] = [
	"log",
	"warn",
	"error",
	"info",
	"debug",
	"table",
];
const target = console as unknown as Record<
	string,
	(...args: unknown[]) => void
>;
const reals = new Map<ConsoleLevel, (...args: unknown[]) => void>();
for (const level of LEVELS) {
	reals.set(level, target[level] as (...args: unknown[]) => void);
	target[level] = () => {};
}

const capture = await import("../src/editor/console/console-capture");

afterAll(() => {
	for (const level of LEVELS) {
		const real = reals.get(level);
		if (real) {
			target[level] = real;
		}
	}
});

const first = (entry: ConsoleEntry): SnapshotValue => {
	expect(entry.args.length).toBeGreaterThan(0);
	return entry.args[0] as SnapshotValue;
};

describe("console capture", () => {
	beforeEach(() => {
		capture.clearConsole();
	});

	test("captures a call synchronously into history", () => {
		console.log("hello", 1);
		const history = capture.consoleHistory();
		expect(history.length).toBe(1);
		const entry = history[0] as ConsoleEntry;
		expect(entry.level).toBe("log");
		expect(entry.count).toBe(1);
		expect(entry.args).toEqual(["hello", 1]);
	});

	test("folds structurally identical consecutive objects, incrementing count", () => {
		console.log({ x: 1, y: 2 });
		console.log({ x: 9, y: 8 });
		console.log({ x: 3, y: 4 });
		const history = capture.consoleHistory();
		expect(history.length).toBe(1);
		expect((history[0] as ConsoleEntry).count).toBe(3);
	});

	test("folds identical strings but splits distinct ones", () => {
		console.log("tick");
		console.log("tick");
		console.log("tock");
		const history = capture.consoleHistory();
		expect(history.length).toBe(2);
		expect((history[0] as ConsoleEntry).count).toBe(2);
		expect((history[1] as ConsoleEntry).count).toBe(1);
	});

	test("does not fold across different levels", () => {
		console.log("same");
		console.warn("same");
		expect(capture.consoleHistory().length).toBe(2);
	});

	test("folding keeps a stable id but a fresh entry object", () => {
		console.log("dup");
		const history = capture.consoleHistory();
		const before = history[0] as ConsoleEntry;
		console.log("dup");
		const after = history[0] as ConsoleEntry;
		expect(after.id).toBe(before.id);
		expect(after).not.toBe(before);
		expect(after.count).toBe(2);
	});

	test("distinct structures push new entries with monotonic ids", () => {
		console.log({ a: 1 });
		console.log({ a: 1, b: 2 });
		const history = capture.consoleHistory();
		expect(history.length).toBe(2);
		const id0 = (history[0] as ConsoleEntry).id;
		const id1 = (history[1] as ConsoleEntry).id;
		expect(id1).toBeGreaterThan(id0);
	});

	test("captured args are snapshots, immune to later mutation", () => {
		const live = { hp: 100 };
		console.log(live);
		live.hp = 0;
		const snap = first(capture.consoleHistory()[0] as ConsoleEntry);
		expect((snap as { hp: number }).hp).toBe(100);
	});

	test("ring buffer caps at 1000, dropping oldest", () => {
		for (let i = 0; i < 1005; i++) {
			console.log(`m${i}`);
		}
		const history = capture.consoleHistory();
		expect(history.length).toBe(1000);
		expect(first(history[0] as ConsoleEntry)).toBe("m5");
		expect(first(history[history.length - 1] as ConsoleEntry)).toBe(
			"m1004",
		);
	});

	test("getConsoleSnapshot changes identity on change, stable otherwise", () => {
		const a = capture.getConsoleSnapshot();
		console.log("x");
		const b = capture.getConsoleSnapshot();
		expect(b).not.toBe(a);
		expect(capture.getConsoleSnapshot()).toBe(b);
		console.log("x");
		expect(capture.getConsoleSnapshot()).not.toBe(b);
		const beforeClear = capture.getConsoleSnapshot();
		capture.clearConsole();
		const afterClear = capture.getConsoleSnapshot();
		expect(afterClear).not.toBe(beforeClear);
		expect(afterClear.length).toBe(0);
	});

	test("clearConsole empties the buffer and bumps the version", () => {
		console.log("a");
		const before = capture.consoleVersion();
		capture.clearConsole();
		expect(capture.consoleHistory().length).toBe(0);
		expect(capture.consoleVersion()).toBeGreaterThan(before);
	});

	test("subscribe/unsubscribe manages listeners without throwing", () => {
		let notified = 0;
		const unsubscribe = capture.subscribeConsole(() => {
			notified++;
		});
		capture.clearConsole();
		expect(notified).toBe(1);
		unsubscribe();
		capture.clearConsole();
		expect(notified).toBe(1);
	});
});
