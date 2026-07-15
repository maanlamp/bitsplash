import {
	serializable,
	serialize,
} from "../serialization/serializable";
import {
	type SerializableValue,
	type ValueType,
	VALUE_TYPE,
} from "../serialization/serializable-value";

@serializable("SequenceRunState")
export class SequenceRunState implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() started = false;
	@serialize() completed: string[] = [];
	@serialize() memory: Record<string, SerializableValue> = {};
	@serialize() blackboard: Record<string, string | number> = {};
	@serialize() pinnedBranches: Record<string, boolean> = {};
	@serialize() spawnedRefs: Record<string, string> = {};
	@serialize() cast: Record<string, string> = {};
	@serialize() controlReleased = false;

	isDone(stepId: string): boolean {
		return this.completed.includes(stepId);
	}

	markDone(stepId: string): void {
		if (!this.completed.includes(stepId)) {
			this.completed.push(stepId);
		}
	}

	memoryFor(stepId: string): Record<string, SerializableValue> {
		const existing = this.memory[stepId];
		if (existing !== undefined && existing !== null) {
			return existing as Record<string, SerializableValue>;
		}
		const fresh: Record<string, SerializableValue> = {};
		this.memory[stepId] = fresh;
		return fresh;
	}
}
