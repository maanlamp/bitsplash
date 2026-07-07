import type { EntityId } from "../engine/ecs";
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

export class SpawnEvent {
	constructor(
		public spawnPoint: EntityId,
		public id: EntityId,
	) {}
}

export class PickupCollectedEvent {
	constructor(
		public entity: EntityId,
		public type: string,
	) {}
}

export class StartQuestEvent {
	constructor(
		public quest: string,
		public stage: string = "offered",
	) {}
}

export class AdvanceQuestEvent {
	constructor(
		public quest: string,
		public to: string,
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
