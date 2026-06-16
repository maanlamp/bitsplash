import type { EntityId } from "../ecs";

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
