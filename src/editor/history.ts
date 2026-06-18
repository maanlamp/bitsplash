import { Subscribable } from "./subscribable";

export type Command = Readonly<{
	undo: () => void | Promise<void>;
	redo: () => void | Promise<void>;
}>;

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

	undo(): void {
		const command = this.undoStack.pop();
		if (!command) {
			return;
		}
		this.redoStack.push(command);
		this.enqueue(command.undo, () => {
			drop(this.redoStack, command);
		});
	}

	redo(): void {
		const command = this.redoStack.pop();
		if (!command) {
			return;
		}
		this.undoStack.push(command);
		this.enqueue(command.redo, () => {
			drop(this.undoStack, command);
		});
	}

	clear(): void {
		if (this.undoStack.length === 0 && this.redoStack.length === 0) {
			return;
		}
		this.undoStack = [];
		this.redoStack = [];
		this.notify();
	}

	private enqueue(
		task: () => void | Promise<void>,
		onError: () => void,
	): void {
		this.running = this.running.then(async () => {
			try {
				await task();
			} catch {
				onError();
			}
			this.notify();
		});
	}
}

const drop = (stack: Command[], command: Command): void => {
	const index = stack.indexOf(command);
	if (index >= 0) {
		stack.splice(index, 1);
	}
};
