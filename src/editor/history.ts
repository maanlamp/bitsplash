import { Subscribable } from "./subscribable";

export type Command = Readonly<{
	undo: () => void;
	redo: () => void;
}>;

export class History extends Subscribable {
	private undoStack: Command[] = [];
	private redoStack: Command[] = [];

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
		command.undo();
		this.redoStack.push(command);
		this.notify();
	}

	redo(): void {
		const command = this.redoStack.pop();
		if (!command) {
			return;
		}
		command.redo();
		this.undoStack.push(command);
		this.notify();
	}

	clear(): void {
		if (this.undoStack.length === 0 && this.redoStack.length === 0) {
			return;
		}
		this.undoStack = [];
		this.redoStack = [];
		this.notify();
	}
}
