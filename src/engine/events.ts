import type { EntityId } from "./ecs";

type EventType<T> = abstract new (...args: any[]) => T;

export default class EventBus {
	private events = new Map<Function, object[]>();

	emit(event: object) {
		const type = event.constructor;

		let list = this.events.get(type);

		if (!list) {
			list = [];
			this.events.set(type, list);
		}

		list.push(event);
	}

	read<T>(event: EventType<T>): readonly T[] {
		return (this.events.get(event) ?? []) as T[];
	}

	clear() {
		this.events.clear();
	}
}

export class CollisionEvent {
	constructor(
		public a: EntityId,
		public b: EntityId,
	) {}
}
