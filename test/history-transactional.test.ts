import { expect, test } from "bun:test";
import { type Command, History } from "../src/editor/history";

const drain = (history: History): Promise<void> => history.settle();

test("a failed undo does not move the command and surfaces the error", async () => {
	const history = new History();
	let undoAttempts = 0;
	const throwing: Command = {
		undo: () => {
			undoAttempts += 1;
			throw new Error("undo failed");
		},
		redo: () => {},
	};
	history.push(throwing);

	expect(history.canUndo).toBe(true);
	expect(history.canRedo).toBe(false);

	history.undo();

	let surfaced: unknown;
	await drain(history).catch((error: unknown) => {
		surfaced = error;
	});
	expect(surfaced).toBeInstanceOf(Error);
	expect((surfaced as Error).message).toBe("undo failed");

	expect(undoAttempts).toBe(1);
	expect(history.canUndo).toBe(true);
	expect(history.canRedo).toBe(false);
});

test("a successful undo/redo round-trip preserves ordering", async () => {
	const history = new History();
	const events: string[] = [];
	const make = (name: string): Command => ({
		undo: () => {
			events.push(`${name}.undo`);
		},
		redo: () => {
			events.push(`${name}.redo`);
		},
	});
	history.push(make("A"));
	history.push(make("B"));

	history.undo();
	await drain(history);

	expect(history.canUndo).toBe(true);
	expect(history.canRedo).toBe(true);

	history.redo();
	await drain(history);

	expect(history.canUndo).toBe(true);
	expect(history.canRedo).toBe(false);
	expect(events).toEqual(["B.undo", "B.redo"]);
});
