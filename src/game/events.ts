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

/**
 * One instance of damage landing on `target`.
 *
 * The two positions are deliberately separate and mean different things:
 *
 * - `origin` is the **stimulus position** perception consumes — where the victim
 *   thinks the blow came from. An arrow offsets it backwards along the shot's
 *   bearing so the enemy looks toward the archer rather than at its own wound.
 * - `hitPoint` is the **precise impact point**, consumed only by VFX. It is
 *   `null` when the emit site has none, which is the signal to fall back to a
 *   burst on the target itself.
 *
 * @example
 * events.emit(
 *   new DamageEvent(victim, 7, false, "sword", attacker, origin, hit.point),
 * );
 */
export class DamageEvent {
	constructor(
		public target: EntityId,
		public amount: number,
		public crit: boolean,
		public flavourSet: string,
		public source: EntityId | null,
		public origin: Vector2 | null = null,
		public hitPoint: Vector2 | null = null,
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
