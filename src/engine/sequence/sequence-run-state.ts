import type { ECS, EntityId } from "../ecs";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import {
	type SerializableValue,
	type ValueType,
	VALUE_TYPE,
} from "../serialization/serializable-value";

@serializable("SequenceRunState")
export class SequenceRunState implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() completed: string[] = [];
	@serialize() memory: Record<string, SerializableValue> = {};
	@serialize() blackboard: Record<string, string | number> = {};
	@serialize() pinnedBranches: Record<string, boolean> = {};
	@serialize() spawnedRefs: Record<string, string> = {};
	@serialize() cast: Record<string, string> = {};
	@serialize() controlReleased = false;

	/**
	 * Weather override entities this run spawned, so they can be despawned the
	 * moment it ends — including the queued-def rollover, which discards this
	 * whole run-state and would otherwise lose the record.
	 *
	 * A promptness record, not the guarantee: every override also carries its
	 * owner, and `WeatherSchedulerSystem` reclaims any whose owner entity is gone,
	 * which is the only release path that also covers a sequence destroyed
	 * outright.
	 */
	@serialize() ownedOverrides: EntityId[] = [];

	isDone(stepId: string): boolean {
		return this.completed.includes(stepId);
	}

	markDone(stepId: string): void {
		if (!this.completed.includes(stepId)) {
			this.completed.push(stepId);
		}
	}

	memoryFor(stepId: string): Record<string, SerializableValue> {
		const existing = this.memory[stepId];
		if (existing !== undefined && existing !== null) {
			return existing as Record<string, SerializableValue>;
		}
		const fresh: Record<string, SerializableValue> = {};
		this.memory[stepId] = fresh;
		return fresh;
	}
}

/**
 * Despawn one weather override this run owns and drop it from the record.
 *
 * @example
 * releaseOwnedOverride(ctx.ecs, ctx.run, id); // an op fast-forwarding past itself
 */
export const releaseOwnedOverride = (
	ecs: ECS,
	run: SequenceRunState,
	id: EntityId,
): void => {
	ecs.destroy(id);
	const at = run.ownedOverrides.indexOf(id);
	if (at >= 0) {
		run.ownedOverrides.splice(at, 1);
	}
};

/**
 * Despawn every weather override this run owns. Called when a sequence ends,
 * however it ends, before anything discards the run-state.
 */
export const releaseOwnedOverrides = (
	ecs: ECS,
	run: SequenceRunState,
): void => {
	for (const id of run.ownedOverrides) {
		ecs.destroy(id);
	}
	run.ownedOverrides.length = 0;
};
