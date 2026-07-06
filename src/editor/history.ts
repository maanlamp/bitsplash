import type { EntityId } from "../engine/ecs";
import type { World } from "../engine/world";
import { Subscribable } from "./subscribable";

export type Command = Readonly<{
	undo: () => void | Promise<void>;
	redo: () => void | Promise<void>;
}>;

export class History extends Subscribable {
	private undoStack: Command[] = [];
	private redoStack: Command[] = [];
	private running: Promise<void> = Promise.resolve();

	world: World | null = null;
	readonly createdIds = new Set<EntityId>();

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

	mark(): number {
		return this.undoStack.length;
	}

	async replayFrom(marker: number): Promise<void> {
		await this.running;
		for (const command of this.undoStack.slice(marker)) {
			await command.redo();
		}
	}

	async replayInto(target: World, marker: number): Promise<void> {
		await this.running;
		const previous = this.world;
		this.world = target;
		try {
			for (const command of this.undoStack.slice(marker)) {
				await command.redo();
			}
		} finally {
			this.world = previous;
		}
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
