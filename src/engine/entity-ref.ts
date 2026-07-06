import type { EntityId } from "./ecs";
import {
	serializable,
	serialize,
} from "./serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "./serialization/serializable-value";

@serializable("EntityRef")
export class EntityRef implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() id: EntityId | null;

	constructor(id: EntityId | null = null) {
		this.id = id;
	}

	set(id: EntityId | null): void {
		this.id = id;
	}
}
