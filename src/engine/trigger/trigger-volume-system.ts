import type { ECS, EntityId } from "../ecs";
import { CollisionEvent } from "../events";
import { profiler } from "../profiling/profiler";
import { type UpdateContext, UpdateSystem } from "../system";
import { TriggerEnteredEvent } from "./events";
import { TriggerVolumeComponent } from "./trigger-volume-component";

export type TriggerVolumeBindings = Readonly<{
	flagActive: (ctx: UpdateContext, flag: string) => boolean;
}>;

type ResolvedVolume = Readonly<{
	id: EntityId;
	volume: TriggerVolumeComponent;
	entered: EntityId;
}>;

@profiler("Trigger volumes", "Interaction")
export class TriggerVolumeSystem implements UpdateSystem {
	constructor(private readonly bindings: TriggerVolumeBindings) {}

	update(ctx: UpdateContext): void {
		const { ecs, events } = ctx;
		for (const event of events.read(CollisionEvent)) {
			const resolved = this.resolve(ecs, event);
			if (!resolved) {
				continue;
			}
			const { id, volume, entered } = resolved;
			if (volume.consumed) {
				continue;
			}
			if (
				volume.requiredFlag &&
				!this.bindings.flagActive(ctx, volume.requiredFlag)
			) {
				continue;
			}
			events.emit(
				new TriggerEnteredEvent(id, entered, volume.targetId),
			);
			if (!volume.repeat) {
				volume.consumed = true;
			}
		}
	}

	private resolve(
		ecs: ECS,
		event: CollisionEvent,
	): ResolvedVolume | null {
		const a = ecs.getComponent(event.a, TriggerVolumeComponent);
		if (a) {
			return { id: event.a, volume: a, entered: event.b };
		}
		const b = ecs.getComponent(event.b, TriggerVolumeComponent);
		if (b) {
			return { id: event.b, volume: b, entered: event.a };
		}
		return null;
	}
}
