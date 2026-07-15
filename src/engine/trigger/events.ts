import type { EntityId } from "../ecs";

export class TriggerEnteredEvent {
	constructor(
		public volume: EntityId,
		public entered: EntityId,
		public targetId: string,
	) {}
}
