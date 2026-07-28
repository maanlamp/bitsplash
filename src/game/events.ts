import type { EntityId } from "../engine/ecs";
import { EntityRef } from "../engine/entity-ref";
import {
	serializable,
	serialize,
} from "../engine/serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "../engine/serialization/serializable-value";
import type Vector2 from "../engine/vector2";

export class InteractEvent {
	constructor(
		public interactable: EntityId,
		public interactor: EntityId,
	) {}
}

export class DamageEvent {
	constructor(
		public target: EntityId,
		public amount: number,
		public crit: boolean,
		public flavourSet: string,
		public source: EntityId | null,
		public origin: Vector2 | null = null,
	) {}
}

export class DeathEvent {
	constructor(public entity: EntityId) {}
}

@serializable("SpawnEvent")
export class SpawnEvent implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() spawnPoint: EntityRef;
	@serialize() id: EntityRef;

	constructor(
		spawnPoint: EntityId | null = null,
		id: EntityId | null = null,
	) {
		this.spawnPoint = new EntityRef(spawnPoint);
		this.id = new EntityRef(id);
	}
}

export class PickupCollectedEvent {
	constructor(
		public entity: EntityId,
		public type: string,
	) {}
}

export class QuestDeclinedEvent {
	constructor(public quest: string) {}
}

export class QuestRewardEvent {
	constructor(
		public quest: string,
		public reward: Readonly<Record<string, unknown>>,
	) {}
}
