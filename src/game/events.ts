import type { EntityId } from "../engine/ecs";

export class DialogueOpenedEvent {
	constructor(public dialogue: EntityId) {}
}

export class DialogueClosedEvent {
	constructor(
		public dialogue: EntityId,
		public source: EntityId | null = null,
	) {}
}

export class CharacterRevealedEvent {
	constructor(
		public dialogue: EntityId,
		public char: string,
		public index: number,
	) {}
}

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
