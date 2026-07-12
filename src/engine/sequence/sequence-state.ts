import type { EntityId } from "../ecs";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import {
	type SerializableValue,
	type ValueType,
	VALUE_TYPE,
} from "../serialization/serializable-value";

@serializable("SequenceState")
export class SequenceState implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() stepId: string;
	@serialize() elapsedInStep: number;
	@serialize() perStepData: Record<string, SerializableValue>;
	@serialize() spawnedRefs: Record<string, EntityId>;

	constructor(
		stepId = "",
		elapsedInStep = 0,
		perStepData: Record<string, SerializableValue> = {},
		spawnedRefs: Record<string, EntityId> = {},
	) {
		this.stepId = stepId;
		this.elapsedInStep = elapsedInStep;
		this.perStepData = perStepData;
		this.spawnedRefs = spawnedRefs;
	}
}
