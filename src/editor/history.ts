import { Subscribable } from "./subscribable";

export type Command = Readonly<{
	undo: () => void | Promise<void>;
	redo: () => void | Promise<void>;
}>;

type Direction = "undo" | "redo";

/**
 * Undo/redo stack whose moves are transactional: a command's live apply must
 * succeed before the stacks are mutated to reflect the move. Applies are
 * serialized through an internal promise chain so operations stay ordered even
 * when a command's `undo`/`redo` is async.
 */
export class History extends Subscribable {
	private undoStack: Command[] = [];
	private redoStack: Command[] = [];
	private running: Promise<void> = Promise.resolve();

	get canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	get canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	push(command: Command): void {
		this.undoStack.push(command);
		this.redoStack = [];
		this.notify();
	}

	/**
	 * Undo the most recent command. The command's `undo` runs first; only once
	 * it resolves is the command moved from the undo stack to the redo stack. A
	 * failed apply leaves the stacks untouched and surfaces the error through the
	 * internal running chain (never silently swallowed).
	 */
	undo(): void {
		this.enqueue("undo");
	}

	/**
	 * Redo the most recently undone command, with the same apply-then-append
	 * transactionality as {@link undo}.
	 */
	redo(): void {
		this.enqueue("redo");
	}

	clear(): void {
		if (this.undoStack.length === 0 && this.redoStack.length === 0) {
			return;
		}
		this.undoStack = [];
		this.redoStack = [];
		this.notify();
	}

	/**
	 * Resolve once the current apply chain has drained. Rejects with the error of
	 * a failed `undo`/`redo` apply, so callers (and tests) can await the outcome
	 * of a queued transactional move.
	 */
	settle(): Promise<void> {
		return this.running;
	}

	private enqueue(direction: Direction): void {
		this.running = this.running
			.catch(() => {})
			.then(() => this.apply(direction));
	}

	private async apply(direction: Direction): Promise<void> {
		const from =
			direction === "undo" ? this.undoStack : this.redoStack;
		const command = from.at(-1);
		if (!command) {
			return;
		}
		await (direction === "undo" ? command.undo() : command.redo());
		this.commit(command, direction);
		this.notify();
	}

	private commit(command: Command, direction: Direction): void {
		const from =
			direction === "undo" ? this.undoStack : this.redoStack;
		const to = direction === "undo" ? this.redoStack : this.undoStack;
		const index = from.lastIndexOf(command);
		if (index >= 0) {
			from.splice(index, 1);
		}
		to.push(command);
	}
}
