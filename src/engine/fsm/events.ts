import type { EntityId } from "../ecs";

export class StateEnterEvent {
	constructor(
		public readonly entity: EntityId,
		public readonly state: string,
	) {}
}

export class StateExitEvent {
	constructor(
		public readonly entity: EntityId,
		public readonly state: string,
	) {}
}
