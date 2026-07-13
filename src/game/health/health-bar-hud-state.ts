import type { EntityId } from "../../engine/ecs";

const same = (
	a: readonly EntityId[],
	b: readonly EntityId[],
): boolean => {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
};

export class HealthBarHudState {
	private ids: readonly EntityId[] = [];
	private readonly listeners = new Set<() => void>();

	getSnapshot = (): readonly EntityId[] => this.ids;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	setIds(ids: readonly EntityId[]): void {
		if (same(this.ids, ids)) {
			return;
		}
		this.ids = ids;
		for (const listener of this.listeners) {
			listener();
		}
	}
}
